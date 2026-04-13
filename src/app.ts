import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import crypto from "crypto";
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
import { feishuCardsPlugin, resolveCardType as resolveCardTypeFromAction } from "./services/feishu/cards/router.js";
import { CardActionDispatcher } from "./services/feishu/cards/card-action-dispatcher.js";
import {
  cardRepoAdapter,
  ingestorAdapter,
  aggregatorAdapter,
  feishuClientAdapter,
  currentVersionFor
} from "./services/feishu/cards/adapters.js";
import { createAdminPanelHandlers } from "./services/feishu/cards/handlers/admin-panel-handler.js";
import type { AdminPanelLifecycleDeps } from "./services/feishu/cards/handlers/admin-panel-handler.js";
import { quizSelectHandler, quizSubmitHandler, QUIZ_SET_RESOLVER_KEY, type ResolvedQuizSet } from "./services/feishu/cards/handlers/quiz-handler.js";
import { peerReviewVoteHandler } from "./services/feishu/cards/handlers/peer-review-handler.js";
import { peerReviewSettleHandler } from "./services/feishu/cards/handlers/peer-review-settle-handler.js";
import { createMessageCommandHandler } from "./services/feishu/message-commands.js";
import { fetchQuizByPeriod, type QuizBankDeps } from "./services/feishu/quiz-bank.js";
import {
  dashboardPinRefreshHandler,
  DASHBOARD_PIN_READER_KEY,
} from "./services/feishu/cards/handlers/dashboard-pin-handler.js";
import type { DashboardPinState } from "./services/feishu/cards/templates/dashboard-pin-v1.js";

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
  adminPanelLifecycle?: AdminPanelLifecycleDeps;
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

  const quizTableId = process.env.FEISHU_BASE_QUIZ_TABLE;
  const quizBankDeps: QuizBankDeps | undefined =
    feishuApiClient && feishuConfig.base.appToken && quizTableId
      ? { feishuClient: feishuApiClient, appToken: feishuConfig.base.appToken, tableId: quizTableId }
      : undefined;

  const cardRepoDeps = cardRepoAdapter(repository);

  // Dashboard URL：优先 FEISHU_LEADERBOARD_URL，其次 PUBLIC_HOST，最后硬编码
  const dashboardUrl =
    feishuConfig.phaseOne?.leaderboardUrl
    || (process.env.PUBLIC_HOST
      ? `${process.env.PUBLIC_HOST}/dashboard/`
      : "https://orz.md/dashboard/");

  const wsRuntime = options?.wsRuntime ?? (feishuApiClient
    ? new LarkFeishuWsRuntime(feishuConfig, async (message) => {
        try {
          console.log(`[AdminPanel] WS onMessage callback fired, message=${!!message}, adminPanelLifecycle=${!!options?.adminPanelLifecycle}, feishuApiClient=${!!feishuApiClient}`);
          if (options?.adminPanelLifecycle && feishuApiClient && message) {
            const ingestorInstance = options?.ingestor as import("./services/feishu/message-commands.js").AutoCaptureIngestor | undefined;
            const handler = createMessageCommandHandler({
              feishuClient: feishuApiClient,
              lifecycle: options.adminPanelLifecycle,
              cardDeps: { repo: cardRepoDeps },
              autoReply: {
                sendTextMessage: (input) => feishuApiClient.sendTextMessage(input),
              },
              ingestor: ingestorInstance ?? undefined,
              listStudents: () => {
                const campId = repository.getDefaultCampId() ?? "default";
                return repository.listMembers(campId)
                  .filter((m) => m.roleType === "student")
                  .map((m) => ({ id: m.id, displayName: m.displayName || m.name }));
              },
              quizBank: quizBankDeps,
              dashboardPin: {
                fetchRanking: (campId: string) => repository.fetchRankingByCamp(campId),
                getDefaultCampId: () => repository.getDefaultCampId() ?? "default",
                dashboardUrl,
                countStudents: () => {
                  const campId = repository.getDefaultCampId() ?? "default";
                  return repository.listMembers(campId)
                    .filter((m) => m.roleType === "student").length;
                },
              },
              autoRegister: async (openId: string) => {
                try {
                  // Fetch name and avatar from Feishu API
                  const profile = feishuApiClient.getMemberProfile
                    ? await feishuApiClient.getMemberProfile({ userId: openId, userIdType: "open_id" })
                    : null;
                  const name = profile?.displayName || `学员${openId.slice(-6)}`;
                  const avatarUrl = profile?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
                  const memberId = `user-${openId.slice(-8)}`;
                  const campId = repository.getDefaultCampId() ?? "default";

                  // Insert as student
                  const db = (repository as any).db;
                  db.prepare(
                    `INSERT OR IGNORE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, source_feishu_open_id, is_participant, is_excluded_from_board, status, hidden_from_board)
                     VALUES (?, ?, ?, ?, ?, '', 'student', ?, 1, 0, 'active', 0)`
                  ).run(memberId, campId, name, name, avatarUrl, openId);

                  console.log(`[AutoRegister] Created student: ${name} (${memberId})`);
                  return { id: memberId, displayName: name };
                } catch (err) {
                  console.error("[AutoRegister] Failed:", err);
                  return null;
                }
              },
            });
            await handler(message);
          } else {
            console.log("[AdminPanel] WS onMessage skipped: missing deps or message");
          }
        } catch (error) {
          console.error("[AdminPanel] Error in onMessage callback:", error);
        }
      })
    : new NoopFeishuWsRuntime());

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? (process.env.APP_ENV === "production" ? false : true),
  });
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
      wildcard: false,
    });

    // SPA fallback: non-asset routes under /dashboard/* return index.html
    const { createReadStream } = await import("fs");
    const indexPath = resolve(dashboardRoot, "index.html");
    app.get("/dashboard/*", async (_request, reply) => {
      return reply.type("text/html").send(createReadStream(indexPath));
    });
  }

  app.addHook("onClose", async () => {
    await wsRuntime.stop();
    repository.close();
  });

  // wsRuntime.start() is called after card dispatcher is set up (see below)

  app.get("/api/health", async () => ({
    ok: true
  }));

  if (process.env.APP_ENV !== "production") {
    app.post("/api/demo/seed", async () => {
      repository.seedDemo();
      return { ok: true };
    });
  }

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
  registerV2BoardRoutes(app, v2, {
    feishuApiClient,
    botChatId: feishuConfig.botChatId,
  });
  registerV2AdminReviewRoutes(app, v2);
  registerV2AdminMembersRoutes(app, v2);
  registerV2LlmStatusRoute(app, v2);

  // ---------------------------------------------------------------------------
  // Sub-project 2: Feishu card protocol
  // Adapters are lazy stubs — they throw only when methods are called, not
  // during construction, so buildApp() completes without throwing.
  // ---------------------------------------------------------------------------
  const cardDispatcher = new CardActionDispatcher({
    repo: cardRepoDeps,
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
    uuid: () => crypto.randomUUID(),
    // Quiz set resolver — returns questions with correct answers for scoring
    [QUIZ_SET_RESOLVER_KEY]: async (setCode: string): Promise<ResolvedQuizSet | null> => {
      if (!quizBankDeps) return null;
      const match = setCode.match(/^period-(\d+)$/);
      if (!match) return null;
      const periodNumber = parseInt(match[1], 10);
      const state = await fetchQuizByPeriod(quizBankDeps, periodNumber);
      return state ? { questions: state.questions } : null;
    },
  } as any);
  if (options?.adminPanelLifecycle) {
    const adminHandlers = createAdminPanelHandlers(options.adminPanelLifecycle);
    cardDispatcher.register("admin_panel", "admin_panel_open_period", adminHandlers.openPeriod);
    cardDispatcher.register("admin_panel", "admin_panel_open_window", adminHandlers.openWindow);
    cardDispatcher.register("admin_panel", "admin_panel_graduation", adminHandlers.graduation);
    cardDispatcher.register("admin_panel", "admin_panel_refresh", adminHandlers.refresh);
  }

  // Quiz card handlers (K2)
  cardDispatcher.register("quiz", "quiz_select", quizSelectHandler);
  cardDispatcher.register("quiz", "quiz_submit", quizSubmitHandler);

  // Peer review card handlers (S1/S2)
  cardDispatcher.register("peer_review_vote", "peer_review_vote", peerReviewVoteHandler);
  cardDispatcher.register("peer_review_settle", "peer_review_settle", peerReviewSettleHandler);

  // Dashboard pin card handler — 刷新按钮
  // 注入排行数据读取器，供刷新按钮回调使用
  const dashboardPinDepsOverride = {
    [DASHBOARD_PIN_READER_KEY]: async (_chatId: string): Promise<DashboardPinState | null> => {
      try {
        const campId = repository.getDefaultCampId() ?? "default";
        const ranking = repository.fetchRankingByCamp(campId);
        const topN = ranking.slice(0, 5).map((r) => ({
          displayName: r.memberName,
          cumulativeAq: r.cumulativeAq,
          currentLevel: r.currentLevel,
        }));
        const totalMembers = repository.listMembers(campId)
          .filter((m) => m.roleType === "student").length;
        const pad = (n: number) => String(n).padStart(2, "0");
        const now = new Date();
        const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        return { topN, totalMembers, generatedAt, dashboardUrl };
      } catch {
        return null;
      }
    },
  };
  cardDispatcher.register("dashboard_pin", "dashboard_pin_refresh", async (ctx, deps) => {
    const extendedDeps = { ...deps, ...dashboardPinDepsOverride };
    return dashboardPinRefreshHandler(ctx, extendedDeps);
  });

  await app.register(feishuCardsPlugin, {
    dispatcher: cardDispatcher,
    currentVersion: currentVersionFor
  });

  // Wire card action handler to WS runtime and start WebSocket
  wsRuntime.setCardActionHandler(async (input) => {
    const actionValue = input.actionValue ?? {};
    const formValue = input.formValue ?? {};
    const actionName = input.actionName ||
      ((actionValue.action as string) ?? "");

    console.log(`[CardAction:app] Received: action="${actionName}", formValue=${JSON.stringify(formValue)}, actionValue=${JSON.stringify(actionValue).slice(0, 200)}`);

    const resolvedCardType = resolveCardTypeFromAction(actionName, actionValue);
    if (!resolvedCardType) {
      console.warn(`[CardAction:app] Could not resolve card type for action="${actionName}"`);
      return { toast: { type: "error", content: "未知卡片操作" } };
    }

    console.log(`[CardAction:app] Resolved cardType="${resolvedCardType}", dispatching...`);

    try {
      const result = await cardDispatcher.dispatch({
        cardType: resolvedCardType,
        actionName,
        payload: { ...actionValue, ...formValue },
        operatorOpenId: input.operatorOpenId,
        triggerId: crypto.randomUUID(),
        messageId: input.messageId,
        chatId: input.chatId,
        receivedAt: new Date().toISOString(),
        currentVersion: currentVersionFor(resolvedCardType),
      });

      console.log(`[CardAction:app] Dispatch result: newCardJson=${!!result.newCardJson}, toast=${JSON.stringify(result.toast ?? null)}`);

      if (result.newCardJson) {
        return { card: result.newCardJson as unknown as Record<string, unknown> };
      }
      if (result.toast) {
        return { toast: result.toast };
      }
      return {};
    } catch (err) {
      console.error(`[CardAction:app] Dispatch error:`, err);
      return { toast: { type: "error", content: "卡片处理失败，请重试" } };
    }
  });
  await wsRuntime.start();

  return app;
}
