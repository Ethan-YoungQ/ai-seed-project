import { describe, expect, it } from "vitest";

import type { ScoringDecision } from "../../../../src/domain/v3/scoring-decision";
import {
  buildPraiseText,
  createNotificationState,
  decideNotification,
} from "../../../../src/services/feishu/ai-boot/notification-orchestrator";

const NOW = Date.UTC(2026, 4, 17, 9, 30, 0);

function decision(overrides: Partial<ScoringDecision> = {}): ScoringDecision {
  return {
    status: "approved",
    category: "ai_artifact",
    scoreDelta: 5,
    confidence: "high",
    notifyPolicy: "group_praise",
    reason: "完成了可复用的 AI 工具",
    evidence: "提交了链接和使用说明",
    badges: [],
    ...overrides,
  };
}

function notify(overrides: {
  decision?: ScoringDecision;
  memberId?: string;
  chatId?: string;
  topicHash?: string;
  now?: number;
  state?: ReturnType<typeof createNotificationState>;
} = {}) {
  return decideNotification({
    decision: overrides.decision ?? decision(),
    memberId: overrides.memberId ?? "member-1",
    chatId: overrides.chatId ?? "chat-1",
    topicHash: overrides.topicHash ?? "topic-1",
    now: overrides.now ?? NOW,
    state: overrides.state ?? createNotificationState(),
  });
}

describe("notification orchestrator", () => {
  it("keeps daily participation silent even when model requested group praise", () => {
    const state = createNotificationState();

    expect(
      notify({
        decision: decision({ category: "daily_participation", notifyPolicy: "group_praise" }),
        state,
      })
    ).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "daily_participation",
    });
    expect(state.lastGlobalPraiseAt).toBe(0);
    expect(state.praiseByStudentToday.size).toBe(0);
  });

  it("keeps review_required silent", () => {
    expect(
      notify({
        decision: decision({ status: "review_required", notifyPolicy: "group_praise" }),
      })
    ).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "status_review_required",
    });
  });

  it("allows approved high-confidence artifact group praise", () => {
    const state = createNotificationState();

    expect(notify({ state })).toEqual({
      shouldSend: true,
      policy: "group_praise",
      reason: "allowed",
    });
    expect(state.lastGlobalPraiseAt).toBe(NOW);
    expect([...state.praiseByStudentToday.values()]).toEqual([1]);
    expect([...state.praiseByChatHour.values()]).toEqual([NOW]);
    expect(state.recentTopicHashes.get("topic-1")).toBe(NOW);
  });

  it("blocks the fourth praise for one student in a day", () => {
    const state = createNotificationState();

    for (let index = 0; index < 3; index += 1) {
      expect(
        notify({
          state,
          topicHash: `topic-${index}`,
          now: NOW + index * 121_000,
        }).shouldSend
      ).toBe(true);
    }

    const blocked = notify({
      state,
      topicHash: "topic-four",
      now: NOW + 3 * 121_000,
    });

    expect(blocked).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "student_daily_cap",
    });
    expect([...state.praiseByStudentToday.values()]).toEqual([3]);
  });

  it("blocks the sixth praise in one chat hour", () => {
    const state = createNotificationState();

    for (let index = 0; index < 5; index += 1) {
      expect(
        notify({
          state,
          memberId: `member-${index}`,
          topicHash: `topic-${index}`,
          now: NOW + index * 121_000,
        }).shouldSend
      ).toBe(true);
    }

    const blocked = notify({
      state,
      memberId: "member-six",
      topicHash: "topic-six",
      now: NOW + 5 * 121_000,
    });

    expect(blocked).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "chat_hourly_cap",
    });
    expect(state.praiseByChatHour.size).toBe(5);
  });

  it("blocks the sixth chat praise within a rolling hour across a UTC hour boundary", () => {
    const state = createNotificationState();
    const beforeUtcHourBoundary = Date.UTC(2026, 4, 17, 9, 50, 0);

    for (let index = 0; index < 5; index += 1) {
      expect(
        notify({
          state,
          memberId: `boundary-member-${index}`,
          topicHash: `boundary-topic-${index}`,
          now: beforeUtcHourBoundary + index * 180_000,
        }).shouldSend
      ).toBe(true);
    }

    const blocked = notify({
      state,
      memberId: "boundary-member-six",
      topicHash: "boundary-topic-six",
      now: beforeUtcHourBoundary + 5 * 180_000,
    });

    expect(blocked).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "chat_hourly_cap",
    });
  });

  it("resets student daily cap at Asia Shanghai midnight instead of UTC midnight", () => {
    const state = createNotificationState();
    const beforeShanghaiMidnight = Date.UTC(2026, 4, 17, 15, 50, 0);

    for (let index = 0; index < 3; index += 1) {
      expect(
        notify({
          state,
          topicHash: `shanghai-topic-${index}`,
          now: beforeShanghaiMidnight + index * 180_000,
        }).shouldSend
      ).toBe(true);
    }

    const afterShanghaiMidnight = notify({
      state,
      topicHash: "shanghai-topic-next-day",
      now: Date.UTC(2026, 4, 17, 16, 1, 0),
    });

    expect(afterShanghaiMidnight).toEqual({
      shouldSend: true,
      policy: "group_praise",
      reason: "allowed",
    });
    expect([...state.praiseByStudentToday.values()]).toEqual([3, 1]);
  });

  it("reserves cooldown before send to avoid concurrent double-send", () => {
    const state = createNotificationState();

    expect(notify({ state, topicHash: "first" })).toMatchObject({
      shouldSend: true,
      reason: "allowed",
    });
    expect(
      notify({
        state,
        memberId: "member-2",
        topicHash: "second",
        now: NOW + 1,
      })
    ).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "global_cooldown",
    });
  });

  it("suppresses duplicate praise for a recent topic hash", () => {
    const state = createNotificationState();

    expect(notify({ state, topicHash: "same-topic" }).shouldSend).toBe(true);

    const blocked = notify({
      state,
      memberId: "member-2",
      topicHash: "same-topic",
      now: NOW + 121_000,
    });

    expect(blocked).toEqual({
      shouldSend: false,
      policy: "silent",
      reason: "duplicate_topic",
    });
  });

  it("builds concise deterministic praise text from decision details", () => {
    expect(buildPraiseText({ memberName: "小王", decision: decision() })).toBe(
      "表扬小王：AI作品获5分。完成了可复用的 AI 工具；依据：提交了链接和使用说明"
    );
  });
});
