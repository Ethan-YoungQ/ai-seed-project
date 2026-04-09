import { loadLocalEnv } from "../config/load-env.js";
import { LarkFeishuApiClient } from "../services/feishu/client.js";
import { readFeishuConfig } from "../services/feishu/config.js";
import { FeishuBootstrapService } from "../services/feishu/bootstrap.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

loadLocalEnv();

const repository = new SqliteRepository(process.env.DATABASE_URL ?? "./data/app.db");
const config = readFeishuConfig();

try {
  if (!config.appId || !config.appSecret) {
    throw new Error("Set FEISHU_APP_ID and FEISHU_APP_SECRET in .env before running bootstrap.");
  }

  const apiClient = new LarkFeishuApiClient(config);
  const service = new FeishuBootstrapService(repository, apiClient, config);
  const chatMemberOpenIds = (process.env.FEISHU_TEST_CHAT_MEMBER_OPEN_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const result = await service.bootstrap({
    campId: process.env.FEISHU_TEST_CAMP_ID?.trim() || undefined,
    chatId: process.env.FEISHU_TEST_CHAT_ID?.trim() || undefined,
    chatName: process.env.FEISHU_TEST_CHAT_NAME?.trim() || "Pfizer HBU AI Evaluator Test Group",
    chatOwnerOpenId: process.env.FEISHU_TEST_CHAT_OWNER_OPEN_ID?.trim() || undefined,
    chatMemberOpenIds,
    baseName: process.env.FEISHU_BASE_NAME?.trim() || "Pfizer HBU AI Evaluator Base"
  });

  console.log("Feishu bootstrap completed.");
  console.log(`Camp: ${result.campId}`);
  console.log(`Chat: ${result.chat.chatId} (${result.chat.source})`);
  console.log("Write these values into your .env:");
  for (const [key, value] of Object.entries(result.env)) {
    console.log(`${key}=${value}`);
  }
} finally {
  repository.close();
}
