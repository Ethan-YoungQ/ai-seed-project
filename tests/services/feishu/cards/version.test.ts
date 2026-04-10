import { describe, expect, test } from "vitest";

import { resolveCardVersion } from "../../../../src/services/feishu/cards/version.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

function instance(partial: Partial<LiveCardRow>): LiveCardRow {
  return {
    id: "flc-x",
    cardType: "daily_checkin",
    feishuMessageId: "om-x",
    feishuChatId: "oc-x",
    campId: "camp-1",
    periodId: null,
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: {},
    sentAt: "2026-04-01T00:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-15T00:00:00.000Z",
    closedReason: null,
    ...partial
  };
}

describe("resolveCardVersion", () => {
  test("returns 'current' when version matches currentVersion", () => {
    const result = resolveCardVersion(
      instance({ cardVersion: "daily-checkin-v2" }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("current");
  });

  test("returns 'legacy' when version matches legacyVersion and age < 7 days", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-06T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("legacy");
  });

  test("returns 'expired' when version matches legacyVersion but age >= 7 days", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-02T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("returns 'expired' when version matches neither current nor legacy", () => {
    const result = resolveCardVersion(
      instance({ cardVersion: "daily-checkin-v0" }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("legacy grace boundary exactly 7 days is treated as 'expired'", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-03T00:00:00.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("expired");
  });

  test("legacy grace boundary just under 7 days is still 'legacy'", () => {
    const result = resolveCardVersion(
      instance({
        cardVersion: "daily-checkin-v1",
        sentAt: "2026-04-03T00:00:01.000Z"
      }),
      "daily-checkin-v2",
      "daily-checkin-v1",
      () => new Date("2026-04-10T00:00:00.000Z")
    );
    expect(result).toBe("legacy");
  });
});
