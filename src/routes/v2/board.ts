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
import type { FeishuApiClient } from "../../services/feishu/client.js";

// 内存缓存：群组名称极少变动，避免每次请求调用飞书 API
let cachedGroupName: string | null = null;
let groupNameFetchedAt = 0;
const GROUP_NAME_CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

export interface BoardRouteDeps {
  feishuApiClient?: FeishuApiClient;
  botChatId?: string;
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
      const rows = deps.repository.fetchRankingByCamp(campId);
      const groupName = boardDeps
        ? await resolveGroupName(boardDeps)
        : null;
      return reply.send({
        ok: true,
        campId,
        rows,
        groupName: groupName ?? "AI 训练营",
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

      const detail = {
        memberId: raw.memberId,
        memberName: raw.memberName,
        avatarUrl: raw.avatarUrl,
        currentLevel: raw.currentLevel,
        cumulativeAq: latestSnap?.cumulativeAq ?? 0,
        dimensions: latestDims
          ? { K: latestDims.K, H: latestDims.H, C: latestDims.C, S: latestDims.S, G: latestDims.G }
          : { K: 0, H: 0, C: 0, S: 0, G: 0 },
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
      };

      return reply.send({ ok: true, detail });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });
}
