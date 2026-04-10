import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { resolve } from "path";
import { fileURLToPath } from "url";

import { loadLocalEnv } from "./config/load-env.js";
import type { FeishuApiClient } from "./services/feishu/client.js";
import { LarkFeishuApiClient } from "./services/feishu/client.js";
import type { FeishuConfig } from "./services/feishu/config.js";
import { readFeishuConfig, withResolvedFeishuConfig } from "./services/feishu/config.js";
import type { FeishuWsRuntime } from "./services/feishu/ws-runtime.js";
import { LarkFeishuWsRuntime, NoopFeishuWsRuntime } from "./services/feishu/ws-runtime.js";
import { readLlmProviderConfig } from "./services/llm/provider-config.js";
import { SqliteRepository } from "./storage/sqlite-repository.js";
import { registerV2EventsRoute } from "./routes/v2/events.js";
import { registerV2PeriodsOpenRoute, registerV2PeriodsCloseRoute } from "./routes/v2/periods.js";
import { registerV2WindowsOpenRoute } from "./routes/v2/windows.js";
import { registerV2GraduationCloseRoute } from "./routes/v2/graduation.js";
import { registerV2BoardRoutes } from "./routes/v2/board.js";
import { registerV2AdminReviewRoutes } from "./routes/v2/admin-review.js";
import { registerV2AdminMembersRoutes } from "./routes/v2/admin-members.js";
import { registerV2LlmStatusRoute } from "./routes/v2/llm-status.js";
import { feishuCardsPlugin } from "./services/feishu/cards/router.js";
import { CardActionDispatcher } from "./services/feishu/cards/card-action-dispatcher.js";
import {
  cardRepoAdapter,
  ingestorAdapter,
  aggregatorAdapter,
  feishuClientAdapter,
  currentVersionFor
} from "./services/feishu/cards/adapters.js";

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

export async function createApp(options?: {
  databaseUrl?: string;
  feishuConfigOverride?: Partial<FeishuConfig>;
  feishuApiClient?: FeishuApiClient;
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

  const wsRuntime = options?.wsRuntime ?? (feishuApiClient
    ? new LarkFeishuWsRuntime(feishuConfig, async () => {
        // v1 inbound pipeline removed; v2 uses card-button events via /api/v2/events
      })
    : new NoopFeishuWsRuntime());

  await app.register(cors);
  await app.register(sensible);

  // ---------------------------------------------------------------------------
  // Dashboard SPA static serving
  // Serves the pre-built Vite output from dist-dashboard/ at /dashboard/
  // Only registered when dist-dashboard/ directory exists (skipped in tests)
  // ---------------------------------------------------------------------------
  const __filename = fileURLToPath(import.meta.url);
  const __dirnameResolved = resolve(fileURLToPath(new URL(".", import.meta.url)));
  void __filename; // satisfy linter - only __dirnameResolved is used
  const dashboardRoot = resolve(__dirnameResolved, "..", "dist-dashboard");

  const { existsSync } = await import("fs");
  if (existsSync(dashboardRoot)) {
    await app.register(fastifyStatic, {
      root: dashboardRoot,
      prefix: "/dashboard/",
      decorateReply: false,
      wildcard: false,
    });

    // SPA fallback: non-asset routes under /dashboard/* return index.html
    app.get("/dashboard/*", async (_request, reply) => {
      return reply.sendFile("index.html", dashboardRoot);
    });
  }

  app.addHook("onClose", async () => {
    await wsRuntime.stop();
    repository.close();
  });

  await wsRuntime.start();

  app.get("/api/health", async () => ({
    ok: true
  }));

  app.post("/api/demo/seed", async () => {
    repository.seedDemo();
    return { ok: true };
  });

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
      groupMessageReadProbe
    };
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
  registerV2GraduationCloseRoute(app, v2);
  registerV2BoardRoutes(app, v2);
  registerV2AdminReviewRoutes(app, v2);
  registerV2AdminMembersRoutes(app, v2);
  registerV2LlmStatusRoute(app, v2);

  // ---------------------------------------------------------------------------
  // Sub-project 2: Feishu card protocol
  // Adapters are lazy stubs — they throw only when methods are called, not
  // during construction, so buildApp() completes without throwing.
  // ---------------------------------------------------------------------------
  const cardDispatcher = new CardActionDispatcher({
    repo: cardRepoAdapter(repository),
    ingestor: ingestorAdapter(v2.ingestor),
    aggregator: aggregatorAdapter(v2.aggregator),
    feishuClient: feishuClientAdapter(feishuApiClient),
    adminApiClient: {
      patchMember: async () => { throw new Error("adminApiClient.patchMember not yet implemented"); },
      listMembers: async () => { throw new Error("adminApiClient.listMembers not yet implemented"); }
    },
    config: {
      groupChatId: feishuConfig?.botChatId ?? "",
      campId: "default",
      cardVersionCurrent: process.env.FEISHU_CARD_VERSION_CURRENT ?? "v1",
      cardVersionLegacy: process.env.FEISHU_CARD_VERSION_LEGACY ?? "v0",
      radarImageBaseUrl: process.env.RADAR_IMAGE_BASE_URL ?? "http://localhost:3000"
    },
    requestReappeal: async () => { throw new Error("requestReappeal not yet implemented"); },
    clock: () => new Date(),
    uuid: () => crypto.randomUUID()
  });
  await app.register(feishuCardsPlugin, {
    dispatcher: cardDispatcher,
    currentVersion: currentVersionFor
  });

  return app;
}
