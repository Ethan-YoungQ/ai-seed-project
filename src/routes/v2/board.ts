/**
 * GET /api/v2/board/ranking — camp-wide leaderboard ranking.
 * GET /api/v2/board/member/:id — per-member detail panel.
 *
 * Both endpoints are public (not admin-gated). The eligibility gate
 * is enforced at the repository layer via ELIGIBLE_STUDENT_WHERE_CLAUSE
 * (spec §5.5 layer 4).
 */
import type { FastifyInstance } from "fastify";
import type { V2Runtime } from "../../app.js";
import { combineLegacyAndV3Score } from "../../domain/v3/scorebook.js";
import type { FeishuApiClient } from "../../services/feishu/client.js";

// 内存缓存：群组名称极少变动，避免每次请求调用飞书 API
let cachedGroupName: string | null = null;
let groupNameFetchedAt = 0;
const GROUP_NAME_CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

export interface BoardRouteDeps {
  feishuApiClient?: FeishuApiClient;
  botChatId?: string;
}

type AdditiveScoreFields = {
  legacyScore: number;
  v3Score: number;
  totalScore: number;
};

function resolveAdditiveScoreFields(
  deps: V2Runtime,
  campId: string,
  memberId: string
): AdditiveScoreFields | undefined {
  const legacySnapshot = deps.repository.getAiBootLegacyScoreSnapshot(campId, memberId);
  const legacyScore = legacySnapshot?.totalScore ?? 0;
  const v3Score = deps.repository.sumApprovedAiBootScore(campId, memberId);
  const approvedV3ScoreEventCount = deps.repository.countApprovedAiBootScoreEventsForMember(
    campId,
    memberId
  );

  if (!legacySnapshot && approvedV3ScoreEventCount === 0) {
    return undefined;
  }

  return {
    legacyScore,
    v3Score,
    totalScore: combineLegacyAndV3Score({
      legacyTotal: legacyScore,
      approvedV3Total: v3Score,
    }),
  };
}

function effectiveRankingScore(row: { cumulativeAq: number; totalScore?: number }): number {
  return row.totalScore ?? row.cumulativeAq;
}

async function resolveGroupName(boardDeps: BoardRouteDeps): Promise<string | null> {
  const now = Date.now();
  if (cachedGroupName !== null && now - groupNameFetchedAt < GROUP_NAME_CACHE_TTL_MS) {
    return cachedGroupName;
  }

  const client = boardDeps.feishuApiClient;
  const chatId = boardDeps.botChatId;
  if (!client?.getChatName || !chatId) {
    return cachedGroupName;
  }

  try {
    const name = await client.getChatName(chatId);
    if (name) {
      cachedGroupName = name;
      groupNameFetchedAt = now;
    }
  } catch {
    // 获取失败时继续使用缓存值
  }

  return cachedGroupName;
}

export function registerV2BoardRoutes(
  app: FastifyInstance,
  deps: V2Runtime,
  boardDeps?: BoardRouteDeps
): void {
  app.get("/api/v2/board/ranking", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? deps.repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({ ok: false, code: "no_camp" });
    }

    try {
      const rows = deps.repository
        .fetchRankingByCamp(campId)
        .map((row) => {
          const scoreFields = resolveAdditiveScoreFields(deps, campId, row.memberId);
          if (!scoreFields) {
            return row;
          }

          return {
            ...row,
            cumulativeAq: scoreFields.totalScore,
            ...scoreFields,
          };
        })
        .sort((left, right) => {
          const scoreDiff = effectiveRankingScore(right) - effectiveRankingScore(left);
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          return left.memberName.localeCompare(right.memberName);
        })
        .map((row, index, sortedRows) => {
          if (
            index === 0 ||
            effectiveRankingScore(row) < effectiveRankingScore(sortedRows[index - 1])
          ) {
            return { ...row, rank: index + 1 };
          }

          return { ...row, rank: sortedRows[index - 1].rank };
        });
      const groupName = boardDeps
        ? await resolveGroupName(boardDeps)
        : null;
      const periodCount = deps.repository.countPeriods?.(campId) ?? 2;
      return reply.send({
        ok: true,
        campId,
        rows,
        groupName: groupName ?? "AI 训练营",
        periodCount,
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });

  app.get("/api/v2/board/member/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      const raw = deps.repository.fetchMemberBoardDetail(params.id);
      if (!raw) {
        return reply.code(404).send({ ok: false, code: "not_found" });
      }

      // Transform to match front-end MemberBoardDetail type
      const latestDims = raw.dimensionSeries[raw.dimensionSeries.length - 1];
      const latestSnap = raw.windowSnapshots[raw.windowSnapshots.length - 1];
      const member = deps.repository.getMember(params.id);
      const scoreFields = member
        ? resolveAdditiveScoreFields(deps, member.campId, raw.memberId)
        : undefined;

      const detail = {
        memberId: raw.memberId,
        memberName: raw.memberName,
        avatarUrl: raw.avatarUrl,
        currentLevel: raw.currentLevel,
        cumulativeAq: scoreFields?.totalScore ?? latestSnap?.cumulativeAq ?? 0,
        dimensions: latestDims
          ? { K: latestDims.K, H: latestDims.H, C: latestDims.C, S: latestDims.S, G: latestDims.G }
          : { K: 0, H: 0, C: 0, S: 0, G: 0 },
        dimensionSeries: raw.dimensionSeries,
        windowSnapshots: raw.windowSnapshots.map((s) => ({
          windowId: s.windowId,
          aq: s.windowAq,
          dims: raw.dimensionSeries.find((d) => d.windowId === s.windowId)
            ?? { K: 0, H: 0, C: 0, S: 0, G: 0 },
          settledAt: "",
        })),
        promotions: raw.promotions.map((p) => ({
          ...p,
          reason: "",
        })),
        ...(scoreFields ?? {}),
      };

      return reply.send({ ok: true, detail });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });
}
