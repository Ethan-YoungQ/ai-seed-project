import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { z } from "zod";

import { loadLocalEnv } from "./config/load-env";
import { renderAnnouncement } from "./services/announcements/render-announcement";
import type { FeishuApiClient } from "./services/feishu/client";
import { LarkFeishuApiClient } from "./services/feishu/client";
import { FeishuBaseSyncService, NoopBaseSyncService } from "./services/feishu/base-sync";
import type { FeishuConfig } from "./services/feishu/config";
import { readFeishuConfig, withResolvedFeishuConfig } from "./services/feishu/config";
import { ConfiguredFeishuMessenger, NoopFeishuMessenger } from "./services/feishu/messenger";
import { normalizeFeishuMessageEvent } from "./services/feishu/normalize-message";
import { LarkFeishuWsRuntime, NoopFeishuWsRuntime } from "./services/feishu/ws-runtime";
import { evaluateMessageWindow } from "./services/scoring/evaluate-window";
import { SqliteRepository } from "./storage/sqlite-repository";

const memberPatchSchema = z.object({
  isParticipant: z.boolean().optional(),
  isExcludedFromBoard: z.boolean().optional(),
  roleType: z.enum(["student", "operator", "trainer", "observer"]).optional()
});

const reviewSchema = z.object({
  action: z.enum(["override_score", "mark_no_count", "restore_status"]),
  reviewer: z.string().min(1),
  note: z.string().min(1),
  override: z
    .object({
      finalStatus: z.enum(["valid", "invalid", "pending_review"]),
      baseScore: z.number().int().min(0),
      processScore: z.number().int().min(0),
      qualityScore: z.number().int().min(0),
      communityBonus: z.number().int().min(0)
    })
    .optional()
});

const announcementSchema = z.object({
  type: z.enum(["deadline_reminder", "submission_summary", "biweekly_ranking", "status_change"]),
  campId: z.string().min(1),
  triggeredBy: z.string().min(1).optional()
});

const sendTestMessageSchema = z.object({
  receiveId: z.string().min(1).optional(),
  receiveIdType: z.enum(["chat_id", "open_id", "email", "union_id"]).optional(),
  text: z.string().min(1)
});

export async function createApp(options?: {
  databaseUrl?: string;
  feishuConfigOverride?: Partial<FeishuConfig>;
  feishuApiClient?: FeishuApiClient;
  feishuMessenger?: {
    sendTextMessage(input: {
      receiveId: string;
      receiveIdType: "chat_id" | "open_id" | "email" | "union_id";
      text: string;
    }): Promise<{ messageId?: string }>;
  };
  baseSyncService?: NoopBaseSyncService | FeishuBaseSyncService;
}) {
  loadLocalEnv();
  const app = Fastify({
    logger: false
  });
  const repository = new SqliteRepository(
    options?.databaseUrl ?? process.env.DATABASE_URL ?? "./data/app.db"
  );
  const baseConfig = readFeishuConfig();
  const feishuConfig = withResolvedFeishuConfig({
    ...baseConfig,
    ...options?.feishuConfigOverride,
    base: {
      ...baseConfig.base,
      ...options?.feishuConfigOverride?.base,
      tables: {
        ...baseConfig.base.tables,
        ...options?.feishuConfigOverride?.base?.tables
      }
    }
  });
  const feishuApiClient =
    options?.feishuApiClient ?? (feishuConfig.enabled ? new LarkFeishuApiClient(feishuConfig) : undefined);
  const baseSync =
    options?.baseSyncService ??
    (feishuApiClient
      ? new FeishuBaseSyncService(feishuConfig.base, feishuApiClient)
      : new NoopBaseSyncService());
  const feishuMessenger =
    options?.feishuMessenger ??
    (feishuApiClient ? new ConfiguredFeishuMessenger(feishuConfig, feishuApiClient) : new NoopFeishuMessenger());
  const wsRuntime = feishuApiClient
    ? new LarkFeishuWsRuntime(feishuConfig, async (normalized) => {
        if (!normalized) {
          return;
        }

        if (normalized.senderType && normalized.senderType !== "user") {
          return;
        }

        if (normalized.chatType && normalized.chatType !== "group") {
          return;
        }

        if (!normalized.chatId) {
          return;
        }

        const camp = repository.getCampByGroupId(normalized.chatId);
        if (!camp) {
          return;
        }

        const member = repository.ensureMember(normalized.memberId, camp.id);
        await baseSync.syncMember(member);
        const result = await evaluateMessageWindow(repository, member, normalized);

        if (!result.accepted || !result.candidateId) {
          return;
        }

        const rawEvent = repository.getRawEvent(`${normalized.memberId}:${normalized.messageId}`);
        const score = repository.getScore(result.candidateId);
        const latestWarning = result.latestWarningId
          ? repository.listWarnings(member.campId).find((entry) => entry.id === result.latestWarningId)
          : undefined;

        if (rawEvent) {
          await baseSync.syncRawEvent(rawEvent);
        }
        if (score) {
          await baseSync.syncScore({
            campId: member.campId,
            member,
            score
          });
        }
        if (latestWarning) {
          await baseSync.syncWarning(latestWarning);
        }
      })
    : new NoopFeishuWsRuntime();

  await app.register(cors);
  await app.register(sensible);

  app.addHook("onClose", async () => {
    await wsRuntime.stop();
    repository.close();
  });

  await wsRuntime.start();

  async function ingestNormalizedMessage(normalized: NonNullable<ReturnType<typeof normalizeFeishuMessageEvent>>) {
    if (normalized.senderType && normalized.senderType !== "user") {
      return {
        accepted: false,
        reason: "unsupported_sender"
      };
    }

    if (normalized.chatType && normalized.chatType !== "group") {
      return {
        accepted: false,
        reason: "unsupported_chat_type"
      };
    }

    if (!normalized.chatId) {
      return {
        accepted: false,
        reason: "missing_chat_id"
      };
    }

    const camp = repository.getCampByGroupId(normalized.chatId);
    if (!camp) {
      return {
        accepted: false,
        reason: "unbound_chat"
      };
    }

    const member = repository.ensureMember(normalized.memberId, camp.id);
    await baseSync.syncMember(member);
    const result = await evaluateMessageWindow(repository, member, normalized);

    if (!result.accepted || !result.candidateId) {
      return result;
    }

    const rawEvent = repository.getRawEvent(`${normalized.memberId}:${normalized.messageId}`);
    const score = repository.getScore(result.candidateId);
    const latestWarning = result.latestWarningId
      ? repository.listWarnings(member.campId).find((entry) => entry.id === result.latestWarningId)
      : undefined;

    if (rawEvent) {
      await baseSync.syncRawEvent(rawEvent);
    }

    if (score) {
      await baseSync.syncScore({
        campId: member.campId,
        member,
        score
      });
    }

    if (latestWarning) {
      await baseSync.syncWarning(latestWarning);
    }

    return result;
  }

  app.get("/api/health", async () => ({
    ok: true
  }));

  app.get("/api/feishu/status", async () => {
    const defaultCamp = repository.getDefaultCamp();
    const baseTablesConfigured = Object.fromEntries(
      Object.entries(feishuConfig.base.tables).map(([key, value]) => [key, Boolean(value)])
    );
    const baseReady =
      feishuConfig.base.enabled &&
      Boolean(feishuConfig.base.appToken) &&
      Object.values(baseTablesConfigured).every(Boolean);

    let credentialsValid = false;
    let validationError: string | null = null;
    if (feishuApiClient && feishuConfig.enabled) {
      try {
        await feishuApiClient.validateCredentials();
        credentialsValid = true;
      } catch (error) {
        validationError = error instanceof Error ? error.message : "credential validation failed";
      }
    }

    return {
      enabled: feishuConfig.enabled,
      credentialsConfigured: Boolean(feishuConfig.appId && feishuConfig.appSecret),
      credentialsValid,
      validationError,
      eventMode: feishuConfig.eventMode,
      longConnectionEnabled: feishuConfig.enabled && feishuConfig.eventMode === "long_connection",
      botConfigured: Boolean(feishuConfig.botChatId),
      campBound: Boolean(defaultCamp?.groupId),
      boundChatId: defaultCamp?.groupId ?? null,
      baseEnabled: feishuConfig.base.enabled,
      baseAppConfigured: Boolean(feishuConfig.base.appToken),
      baseTablesConfigured,
      baseReady,
      baseTables: feishuConfig.base.tables
    };
  });

  app.post("/api/demo/seed", async () => {
    repository.seedDemo();
    return { ok: true };
  });

  app.post("/api/feishu/events", async (request, reply) => {
    const payload = request.body as Record<string, unknown>;
    if (typeof payload.challenge === "string") {
      return { challenge: payload.challenge };
    }

    const normalized = normalizeFeishuMessageEvent(payload);
    if (!normalized) {
      return reply.code(400).send({
        message: "Invalid Feishu message payload"
      });
    }

    return ingestNormalizedMessage(normalized);
  });

  app.get("/api/dashboard/ranking", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return repository.getPublicBoard(campId);
  });

  app.get("/api/public-board", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return repository.getPublicBoard(campId);
  });

  app.get("/api/public-board/snapshots", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return {
      entries: repository.listSnapshots(campId)
    };
  });

  app.get("/api/members", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return {
      entries: repository.listMembers(campId)
    };
  });

  app.patch("/api/members/:memberId", async (request, reply) => {
    const params = request.params as { memberId: string };
    const patch = memberPatchSchema.parse(request.body);
    const updated = repository.updateMember(params.memberId, patch);

    if (!updated) {
      return reply.code(404).send({
        message: "Member not found"
      });
    }

    await baseSync.syncMember(updated);
    return updated;
  });

  app.get("/api/operator/submissions", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return {
      entries: repository.listOperatorSubmissions(campId)
    };
  });

  app.get("/api/operator/warnings", async (request, reply) => {
    const query = request.query as { campId?: string };
    const campId = query.campId ?? repository.getDefaultCampId();

    if (!campId) {
      return reply.code(404).send({
        message: "No active camp found"
      });
    }

    return {
      entries: repository.listWarnings(campId)
    };
  });

  app.post("/api/reviews/:candidateId", async (request, reply) => {
    const params = request.params as { candidateId: string };
    const review = reviewSchema.parse(request.body);
    const updated = repository.overrideReview(params.candidateId, review);

    if (!updated) {
      return reply.code(404).send({
        message: "Candidate not found"
      });
    }

    const member = repository.getMember(updated.memberId);
    if (member) {
      await baseSync.syncReview({
        campId: member.campId,
        member,
        score: updated
      });
    }

    const latestWarning = repository.listWarnings(member?.campId ?? repository.getDefaultCampId() ?? "").at(-1);
    if (latestWarning) {
      await baseSync.syncWarning(latestWarning);
    }

    return updated;
  });

  app.post("/api/announcements/preview", async (request) => {
    const input = announcementSchema.parse(request.body);
    const board = repository.getPublicBoard(input.campId);
    const warnings = repository.listWarnings(input.campId);

    return {
      type: input.type,
      text: renderAnnouncement({
        type: input.type,
        entries: board.entries,
        warnings
      })
    };
  });

  app.post("/api/announcements/run", async (request) => {
    const input = announcementSchema.parse(request.body);
    const board = repository.getPublicBoard(input.campId);
    const warnings = repository.listWarnings(input.campId);
    const text = renderAnnouncement({
      type: input.type,
      entries: board.entries,
      warnings
    });
    let status: "recorded" | "sent" | "failed" = "recorded";

    try {
      if (feishuConfig.botChatId) {
        await feishuMessenger.sendTextMessage({
          receiveId: feishuConfig.botChatId,
          receiveIdType: feishuConfig.botReceiveIdType,
          text
        });
        status = "sent";
      }
    } catch {
      status = "failed";
    }

    const job = repository.createAnnouncementJob({
      campId: input.campId,
      type: input.type,
      text,
      triggeredBy: input.triggeredBy ?? "system",
      status
    });
    const snapshot = repository.createSnapshot(input.campId, input.triggeredBy ?? "system");
    await baseSync.syncSnapshot(snapshot);

    return {
      status: job.status,
      announcementId: job.id,
      snapshotId: snapshot.id
    };
  });

  app.post("/api/feishu/send-test", async (request, reply) => {
    const input = sendTestMessageSchema.parse(request.body);

    try {
      const result = await feishuMessenger.sendTextMessage({
        receiveId: input.receiveId ?? feishuConfig.botChatId ?? "",
        receiveIdType: input.receiveIdType ?? feishuConfig.botReceiveIdType,
        text: input.text
      });

      return {
        ok: true,
        ...result
      };
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to send Feishu test message"
      });
    }
  });

  return app;
}
