import { describe, expect, it } from "vitest";

import { resolveSessionForEvent } from "../../src/domain/session-windows";
import type { SessionDefinition } from "../../src/domain/types";

describe("resolveSessionForEvent", () => {
  const sessions: SessionDefinition[] = [
    {
      id: "session-01",
      campId: "camp-01",
      title: "Kickoff",
      homeworkTag: "#HW01",
      courseDate: "2026-04-03T09:00:00.000Z",
      deadlineAt: "2026-04-17T08:59:59.000Z",
      windowStart: "2026-04-03T09:00:00.000Z",
      windowEnd: "2026-04-17T08:59:59.000Z",
      cycleType: "biweekly",
      active: true
    }
  ];

  it("matches a tagged event inside the biweekly window", () => {
    const resolved = resolveSessionForEvent(
      {
        eventTime: "2026-04-10T10:00:00.000Z",
        parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"]
      },
      sessions
    );

    expect(resolved?.id).toBe("session-01");
  });

  it("does not match an event outside the session window", () => {
    const resolved = resolveSessionForEvent(
      {
        eventTime: "2026-04-20T10:00:00.000Z",
        parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"]
      },
      sessions
    );

    expect(resolved).toBeUndefined();
  });

  it("matches a file submission inside the active window even when no homework tag is present", () => {
    const resolved = resolveSessionForEvent(
      {
        eventTime: "2026-04-10T10:00:00.000Z",
        parsedTags: [],
        isEligibleDocument: true
      },
      sessions
    );

    expect(resolved?.id).toBe("session-01");
  });
});
