import { describe, expect, it } from "vitest";

import { readFeishuConfig } from "../../src/services/feishu/config";

describe("readFeishuConfig", () => {
  it("keeps phase-one links compatible with the legacy *_DOC_URL env keys", () => {
    const config = readFeishuConfig({
      FEISHU_APP_ID: "cli_test",
      FEISHU_APP_SECRET: "secret_test",
      FEISHU_LEARNER_HOME_DOC_URL: "https://example.com/learner",
      FEISHU_OPERATOR_HOME_DOC_URL: "https://example.com/operator",
      FEISHU_LEADERBOARD_URL: "https://example.com/leaderboard"
    });

    expect(config.enabled).toBe(true);
    expect(config.phaseOne).toMatchObject({
      learnerHomeUrl: "https://example.com/learner",
      operatorHomeUrl: "https://example.com/operator",
      leaderboardUrl: "https://example.com/leaderboard"
    });
  });

  it("prefers the current *_HOME_URL keys when both current and legacy values exist", () => {
    const config = readFeishuConfig({
      FEISHU_APP_ID: "cli_test",
      FEISHU_APP_SECRET: "secret_test",
      FEISHU_LEARNER_HOME_URL: "https://example.com/current-learner",
      FEISHU_LEARNER_HOME_DOC_URL: "https://example.com/legacy-learner",
      FEISHU_OPERATOR_HOME_URL: "https://example.com/current-operator",
      FEISHU_OPERATOR_HOME_DOC_URL: "https://example.com/legacy-operator",
      FEISHU_LEADERBOARD_URL: "https://example.com/leaderboard"
    });

    expect(config.phaseOne).toMatchObject({
      learnerHomeUrl: "https://example.com/current-learner",
      operatorHomeUrl: "https://example.com/current-operator",
      leaderboardUrl: "https://example.com/leaderboard"
    });
  });
});
