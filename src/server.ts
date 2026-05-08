import { loadLocalEnv } from "./config/load-env.js";
import { createApp } from "./app.js";
import { wireV2Production } from "./v2-production-wiring.js";
import { SqliteRepository } from "./storage/sqlite-repository.js";
import { LarkFeishuApiClient } from "./services/feishu/client.js";
import { readFeishuConfig, withResolvedFeishuConfig } from "./services/feishu/config.js";

loadLocalEnv();
const port = Number(process.env.PORT ?? 3000);

// Pre-create the repository so we can wire v2 deps before passing to createApp
const databaseUrl = process.env.DATABASE_URL ?? "./data/app.db";
const repo = new SqliteRepository(databaseUrl);

// Set up Feishu client for sending announcement cards after settlement
const feishuConfig = readFeishuConfig();
const resolvedConfig = withResolvedFeishuConfig(feishuConfig);
const feishuClient = resolvedConfig.enabled ? new LarkFeishuApiClient(resolvedConfig) : undefined;

const v2 = wireV2Production(repo, {
  groupChatId: resolvedConfig.botChatId,
  sendCard: feishuClient
    ? async (chatId, card) => {
        await feishuClient.sendCardMessage({
          chatId,
          cardJson: card as unknown as Record<string, unknown>,
        });
      }
    : undefined,
});

const app = await createApp({
  databaseUrl,
  ingestor: v2.ingestor,
  aggregator: v2.aggregator,
  periodLifecycle: v2.periodLifecycle,
  windowSettler: v2.windowSettler,
  llmWorker: v2.llmWorker,
  adminPanelLifecycle: v2.adminPanelLifecycle,
});

try {
  await app.listen({
    port,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
