import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { z } from "zod";

import { loadLocalEnv } from "./config/load-env.js";
import { renderAnnouncement } from "./services/announcements/render-announcement.js";
import { LocalDocumentTextExtractor, type DocumentTextExtractor } from "./services/documents/extract-text.js";
import type { FeishuApiClient } from "./services/feishu/client.js";
import { LarkFeishuApiClient } from "./services/feishu/client.js";
import { FeishuBaseSyncService, NoopBaseSyncService } from "./services/feishu/base-sync.js";
import type { FeishuConfig } from "./services/feishu/config.js";
import { readFeishuConfig, withResolvedFeishuConfig } from "./services/feishu/config.js";
import { ConfiguredFeishuMessenger, NoopFeishuMessenger } from "./services/feishu/messenger.js";
import { normalizeFeishuMessageEvent, type NormalizedFeishuMessage } from "./services/feishu/normalize-message.js";
import type { FeishuWsRuntime } from "./services/feishu/ws-runtime.js";
import { LarkFeishuWsRuntime, NoopFeishuWsRuntime } from "./services/feishu/ws-runtime.js";
import { evaluateMessageWindow } from "./services/scoring/evaluate-window.js";
import { readLlmProviderConfig } from "./services/llm/provider-config.js";
import { SqliteRepository } from "./storage/sqlite-repository.js";
import { registerV2EventsRoute } from "./routes/v2/events.js";
import { registerV2PeriodsOpenRoute, registerV2PeriodsCloseRoute } from "./routes/v2/periods.js";
import { registerV2WindowsOpenRoute } from "./routes/v2/windows.js";

// ---------------------------------------------------------------------------
// v2 admin middleware
// ---------------------------------------------------------------------------

function readOpenIdHeader(request: { headers: Record<string, unknown> }): string | null {
  const raw = request.headers["x-feishu-open-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function requireAdmin(repository: SqliteRepository) {
  return async function adminHook(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply
  ) {
    const openId = readOpenIdHeader(request);
    if (!openId) {
      return reply.code(401).send({ ok: false, code: "no_identity" });
    }
    const member = repository.findMemberByFeishuOpenId(openId);
    if (
      !member ||
      (member.roleType !== "operator" && member.roleType !== "trainer")
    ) {
      return reply.code(403).send({ ok: false, code: "not_admin" });
    }
    request.currentAdmin = member;
  };
}

// ---------------------------------------------------------------------------
// v2 dependency bundle
// ---------------------------------------------------------------------------

export interface V2Runtime {
  repository: SqliteRepository;
  ingestor: unknown;
  aggregator: unknown;
  periodLifecycle: unknown;
  windowSettler: unknown;
  llmWorker: unknown;
  reactionTracker: unknown;
  memberSync: unknown;
}

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
  documentTextExtractor?: DocumentTextExtractor;
  baseSyncService?: NoopBaseSyncService | FeishuBaseSyncService;
  wsRuntime?: FeishuWsRuntime;
  // v2 dependency injection
  ingestor?: unknown;
  aggregator?: unknown;
  periodLifecycle?: unknown;
  windowSettler?: unknown;
  llmWorker?: unknown;
  reactionTracker?: unknown;
  memberSync?: unknown;
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
    phaseOne: {
      ...baseConfig.phaseOne,
      ...options?.feishuConfigOverride?.phaseOne
    },
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
      ? new FeishuBaseSyncService(feishuConfig.base, feishuApiClient, repository)
      : new NoopBaseSyncService());
  const feishuMessenger =
    options?.feishuMessenger ??
    (feishuApiClient ? new ConfiguredFeishuMessenger(feishuConfig, feishuApiClient) : new NoopFeishuMessenger());
  const documentTextExtractor = options?.documentTextExtractor ?? new LocalDocumentTextExtractor();
  const inboundDiagnostics: {
    lastInboundEventAt: string | null;
    lastInboundReason: string | null;
    lastInboundError: string | null;
    lastNormalizedMessage:
      | {
          messageId: string;
          chatId?: string;
          messageType?: string;
          fileName?: string;
          fileExt?: string;
          fileKey?: string;
          mimeType?: string;
          documentParseStatus?: string;
          documentParseReason?: string | null;
          documentTextLength?: number;
        }
      | null;
  } = {
    lastInboundEventAt: null,
    lastInboundReason: null,
    lastInboundError: null,
    lastNormalizedMessage: null
  };

  async function enrichInboundMessage(normalized: NormalizedFeishuMessage) {
    if (
      normalized.messageType !== "file" ||
      normalized.documentParseStatus === "unsupported" ||
      !normalized.fileKey ||
      !feishuApiClient
    ) {
      return normalized;
    }

    try {
      const file = await feishuApiClient.getMessageFile({
        messageId: normalized.messageId,
        fileKey: normalized.fileKey,
        fileName: normalized.fileName
      });
      const extraction = await documentTextExtractor.extract({
        fileName: file.fileName,
        fileExt: file.fileExt,
        bytes: file.bytes
      });

      return {
        ...normalized,
        fileName: normalized.fileName ?? file.fileName,
        fileExt: normalized.fileExt ?? file.fileExt,
        mimeType: normalized.mimeType ?? file.mimeType,
        documentText: extraction.text,
        documentParseStatus: extraction.status,
        documentParseReason: extraction.reason
      };
    } catch (error) {
      return {
        ...normalized,
        documentText: "",
        documentParseStatus: "failed" as const,
        documentParseReason: error instanceof Error ? error.message : "document_download_failed"
      };
    }
  }

  async function processInboundMessage(normalized: NormalizedFeishuMessage) {
    inboundDiagnostics.lastInboundEventAt = normalized.eventTime;
    inboundDiagnostics.lastInboundError = null;

    try {
      const enriched = await enrichInboundMessage(normalized);
      inboundDiagnostics.lastNormalizedMessage = {
        messageId: enriched.messageId,
        chatId: enriched.chatId,
        messageType: enriched.messageType,
        fileName: enriched.fileName,
        fileExt: enriched.fileExt,
        fileKey: enriched.fileKey,
        mimeType: enriched.mimeType,
        documentParseStatus: enriched.documentParseStatus,
        documentParseReason: enriched.documentParseReason ?? null,
        documentTextLength: enriched.documentText?.length ?? 0
      };
      const result = await ingestNormalizedMessage(enriched);
      inboundDiagnostics.lastInboundReason =
        typeof result === "object" && result && "accepted" in result && result.accepted === false
          ? String((result as { reason?: string }).reason ?? "ignored")
          : null;
      return result;
    } catch (error) {
      inboundDiagnostics.lastInboundReason = "inbound_processing_failed";
      inboundDiagnostics.lastInboundError =
        error instanceof Error ? error.message : "unexpected_inbound_processing_error";
      return {
        accepted: false,
        reason: "inbound_processing_failed"
      };
    }
  }

  const wsRuntime = options?.wsRuntime ?? (feishuApiClient
    ? new LarkFeishuWsRuntime(feishuConfig, async (normalized) => {
        if (!normalized) {
          return;
        }
        await processInboundMessage(normalized);
      })
    : new NoopFeishuWsRuntime());

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
    const rawEvent = repository.getRawEvent(`${normalized.memberId}:${normalized.messageId}`);

    if (rawEvent) {
      await baseSync.syncRawEvent(rawEvent);
    }

    if (!result.candidateId) {
      return result;
    }

    const score = repository.getScore(result.candidateId);
    const latestWarning = result.latestWarningId
      ? repository.listWarnings(member.campId).find((entry) => entry.id === result.latestWarningId)
      : undefined;

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
    const llmConfig = readLlmProviderConfig(process.env);
    const defaultCamp = repository.getDefaultCamp();
    const baseTablesConfigured = Object.fromEntries(
      Object.entries(feishuConfig.base.tables).map(([key, value]) => [key, Boolean(value)])
    );
    const phaseOneLinks = {
      learnerHomeUrl: feishuConfig.phaseOne?.learnerHomeUrl ?? null,
      operatorHomeUrl: feishuConfig.phaseOne?.operatorHomeUrl ?? null,
      leaderboardUrl: feishuConfig.phaseOne?.leaderboardUrl ?? null
    };
    const baseReady =
      feishuConfig.base.enabled &&
      Boolean(feishuConfig.base.appToken) &&
      Object.values(baseTablesConfigured).every(Boolean);

    let credentialsValid = false;
    let validationError: string | null = null;
    let groupMessageReadProbe:
      | {
          ok: boolean;
          code?: number;
          message?: string;
          missingScope?: string;
          logId?: string;
        }
      | null = null;
    if (feishuApiClient && feishuConfig.enabled) {
      try {
        await feishuApiClient.validateCredentials();
        credentialsValid = true;
      } catch (error) {
        validationError = error instanceof Error ? error.message : "credential validation failed";
      }

      if (defaultCamp?.groupId) {
        groupMessageReadProbe = await feishuApiClient.probeGroupMessageAccess({
          chatId: defaultCamp.groupId
        });
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
      baseTables: feishuConfig.base.tables,
      phaseOne: {
        homeTemplates: {
          learner: "docs/feishu/learner-homepage-copy.md",
          operator: "docs/feishu/operator-homepage-copy.md"
        },
        entryContract: phaseOneLinks,
        linksConfigured: {
          learnerHomeUrl: Boolean(phaseOneLinks.learnerHomeUrl),
          operatorHomeUrl: Boolean(phaseOneLinks.operatorHomeUrl),
          leaderboardUrl: Boolean(phaseOneLinks.leaderboardUrl)
        }
      },
      llm: {
        enabled: llmConfig.enabled,
        provider: llmConfig.provider,
        baseUrl: llmConfig.baseUrl || null,
        textModel: llmConfig.textModel,
        fileModel: llmConfig.fileModel || null,
        fileExtractor: llmConfig.fileExtractor,
        fileParserToolType: llmConfig.fileParserToolType,
        timeoutMs: llmConfig.timeoutMs,
        maxInputChars: llmConfig.maxInputChars,
        concurrency: llmConfig.concurrency
      },
      groupMessageReadAccess: groupMessageReadProbe?.ok ?? null,
      groupMessageReadProbe,
      lastInboundEventAt: inboundDiagnostics.lastInboundEventAt,
      lastInboundReason: inboundDiagnostics.lastInboundReason,
      lastInboundError: inboundDiagnostics.lastInboundError,
      lastNormalizedMessage: inboundDiagnostics.lastNormalizedMessage
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

    return processInboundMessage(normalized);
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

  // ---------------------------------------------------------------------------
  // v2 runtime wiring — each dep can be injected or defaults to a stub
  // ---------------------------------------------------------------------------
  const v2: V2Runtime = {
    repository,
    ingestor: options?.ingestor ?? null,
    aggregator: options?.aggregator ?? null,
    periodLifecycle: options?.periodLifecycle ?? null,
    windowSettler: options?.windowSettler ?? null,
    llmWorker: options?.llmWorker ?? null,
    reactionTracker: options?.reactionTracker ?? null,
    memberSync: options?.memberSync ?? null,
  };
  // v2 route registration
  registerV2EventsRoute(app, v2);
  registerV2PeriodsOpenRoute(app, v2);
  registerV2PeriodsCloseRoute(app, v2);
  registerV2WindowsOpenRoute(app, v2);

  return app;
}
