import { beforeEach, describe, expect, test, vi } from "vitest";

import { EventIngestor } from "../../../src/domain/v2/ingestor.js";
import type { IngestorDeps, IngestInput } from "../../../src/domain/v2/ingestor.js";
import type { EligibilityInput } from "../../../src/domain/v2/eligibility.js";

interface MemberRow extends EligibilityInput {
  id: string;
}

interface PeriodRow {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  endedAt: string | null;
}

interface EventRow {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  scoreDelta: number;
  sourceRef: string;
  status: "pending" | "approved" | "rejected" | "review_required";
  llmTaskId: string | null;
  reviewNote: string | null;
  payloadJson: string | null;
}

interface DimRow {
  memberId: string;
  periodId: string;
  dimension: "K" | "H" | "C" | "S" | "G";
  periodScore: number;
}

interface LlmTaskRow {
  id: string;
  eventId: string;
  promptText: string;
  status: "pending";
}

interface TestState {
  members: Map<string, MemberRow>;
  activePeriod: PeriodRow | null;
  events: EventRow[];
  dims: DimRow[];
  llmTasks: LlmTaskRow[];
  nextEventSeq: number;
  nextTaskSeq: number;
}

function makeState(): TestState {
  return {
    members: new Map([
      [
        "member-1",
        {
          id: "member-1",
          roleType: "student",
          isParticipant: true,
          isExcludedFromBoard: false
        }
      ]
    ]),
    activePeriod: {
      id: "period-1",
      campId: "camp-1",
      number: 2,
      isIceBreaker: false,
      endedAt: null
    },
    events: [],
    dims: [],
    llmTasks: [],
    nextEventSeq: 1,
    nextTaskSeq: 1
  };
}

function makeDeps(state: TestState): IngestorDeps {
  return {
    findMemberById: vi.fn((id: string) => state.members.get(id) ?? null),
    findActivePeriod: vi.fn(() => state.activePeriod),
    sumApprovedScoreDelta: vi.fn(
      (memberId: string, periodId: string, itemCode: string) =>
        state.events
          .filter(
            (e) =>
              e.memberId === memberId &&
              e.periodId === periodId &&
              e.itemCode === itemCode &&
              e.status === "approved"
          )
          .reduce((acc, e) => acc + e.scoreDelta, 0)
    ),
    sumPendingScoreDelta: vi.fn(
      (memberId: string, periodId: string, itemCode: string) =>
        state.events
          .filter(
            (e) =>
              e.memberId === memberId &&
              e.periodId === periodId &&
              e.itemCode === itemCode &&
              e.status === "pending"
          )
          .reduce((acc, e) => acc + e.scoreDelta, 0)
    ),
    findEventBySourceRef: vi.fn(
      (memberId: string, periodId: string, itemCode: string, sourceRef: string) =>
        state.events.find(
          (e) =>
            e.memberId === memberId &&
            e.periodId === periodId &&
            e.itemCode === itemCode &&
            e.sourceRef === sourceRef
        ) ?? null
    ),
    insertScoringEvent: vi.fn((row) => {
      const id = `evt-${state.nextEventSeq++}`;
      state.events.push({
        ...row,
        id,
        llmTaskId: null,
        payloadJson: row.payloadJson ?? null
      });
      return id;
    }),
    incrementMemberDimensionScore: vi.fn(
      (memberId: string, periodId: string, dimension: DimRow["dimension"], delta: number) => {
        const existing = state.dims.find(
          (d) =>
            d.memberId === memberId &&
            d.periodId === periodId &&
            d.dimension === dimension
        );
        if (existing) {
          existing.periodScore += delta;
        } else {
          state.dims.push({ memberId, periodId, dimension, periodScore: delta });
        }
      }
    ),
    insertLlmScoringTask: vi.fn(
      (row: { eventId: string; promptText: string; provider: string; model: string }) => {
        const id = `task-${state.nextTaskSeq++}`;
        state.llmTasks.push({
          id,
          eventId: row.eventId,
          promptText: row.promptText,
          status: "pending"
        });
        return id;
      }
    ),
    linkEventToLlmTask: vi.fn((eventId: string, taskId: string) => {
      const evt = state.events.find((e) => e.id === eventId);
      if (evt) evt.llmTaskId = taskId;
    }),
    provider: "fake",
    model: "fake-model",
    runInTransaction: vi.fn(<T>(fn: () => T) => fn()),
    now: () => "2026-04-10T00:00:00.000Z",
    generateId: () => "gen-id"
  };
}

function ingest(overrides: Partial<IngestInput> = {}): IngestInput {
  return {
    memberId: "member-1",
    itemCode: "K1",
    scoreDelta: 3,
    sourceRef: "src-1",
    ...overrides
  };
}

describe("EventIngestor.ingest", () => {
  let state: TestState;
  let ingestor: EventIngestor;

  beforeEach(() => {
    state = makeState();
    ingestor = new EventIngestor(makeDeps(state));
  });

  test("accepts non-LLM item and writes approved event + dimension score", () => {
    const result = ingestor.ingest(ingest({ itemCode: "K1", scoreDelta: 3 }));
    expect(result.accepted).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].status).toBe("approved");
    const k = state.dims.find((d) => d.dimension === "K");
    expect(k?.periodScore).toBe(3);
  });

  test("rejects when member is not eligible", () => {
    state.members.set("member-1", {
      id: "member-1",
      roleType: "operator",
      isParticipant: true,
      isExcludedFromBoard: false
    });
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("not_eligible");
    expect(state.events).toHaveLength(0);
  });

  test("rejects when there is no active period", () => {
    state.activePeriod = null;
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no_active_period");
  });

  test("rejects when active period is ice-breaker", () => {
    state.activePeriod = {
      id: "period-ice",
      campId: "camp-1",
      number: 1,
      isIceBreaker: true,
      endedAt: null
    };
    const result = ingestor.ingest(ingest());
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("ice_breaker_no_scoring");
  });

  test("inserts rejected zero-delta row when cap is already exhausted", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "K1",
      scoreDelta: 3,
      sourceRef: "src-seed",
      status: "approved",
      llmTaskId: null,
      reviewNote: null,
      payloadJson: null
    });
    const result = ingestor.ingest(ingest({ sourceRef: "src-2" }));
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("cap_exceeded");
    const rejected = state.events.find((e) => e.status === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected?.scoreDelta).toBe(0);
    expect(rejected?.reviewNote).toBe("per_period_cap_exceeded");
  });

  test("clamps effective delta when remaining is smaller than requested", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "C1",
      scoreDelta: 5,
      sourceRef: "src-seed",
      status: "approved",
      llmTaskId: null,
      reviewNote: null,
      payloadJson: null
    });
    const result = ingestor.ingest(
      ingest({ itemCode: "C1", scoreDelta: 4, sourceRef: "src-2" })
    );
    expect(result.accepted).toBe(true);
    const fresh = state.events.find((e) => e.sourceRef === "src-2");
    expect(fresh?.scoreDelta).toBe(3);
  });

  test("pending sum counts against cap for the same item", () => {
    state.events.push({
      id: "evt-seed",
      memberId: "member-1",
      periodId: "period-1",
      itemCode: "K3",
      scoreDelta: 3,
      sourceRef: "src-seed",
      status: "pending",
      llmTaskId: null,
      reviewNote: null,
      payloadJson: null
    });
    const result = ingestor.ingest(
      ingest({
        itemCode: "K3",
        scoreDelta: 3,
        sourceRef: "src-2",
        payloadText: "new submission 30chars................"
      })
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("cap_exceeded");
  });

  test("rejects duplicate sourceRef for the same member/period/item", () => {
    // Use scoreDelta: 1 so cap (3) is NOT exhausted by the first call,
    // allowing the second call to reach the idempotency check.
    const first = ingestor.ingest(ingest({ itemCode: "K1", scoreDelta: 1, sourceRef: "dup-ref" }));
    expect(first.accepted).toBe(true);
    const second = ingestor.ingest(ingest({ itemCode: "K1", scoreDelta: 1, sourceRef: "dup-ref" }));
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("duplicate");
    expect(state.events.filter((e) => e.sourceRef === "dup-ref")).toHaveLength(1);
  });

  test("LLM item K3 creates pending event, enqueues task, and does NOT increment dimension score", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "K3",
        scoreDelta: 3,
        sourceRef: "src-llm",
        payloadText: "今天学到了 attention 的 QKV 机制,和 CNN 的卷积核很不一样"
      })
    );
    expect(result.accepted).toBe(true);
    expect(state.events[0].status).toBe("pending");
    expect(state.llmTasks).toHaveLength(1);
    expect(state.llmTasks[0].eventId).toBe(state.events[0].id);
    expect(state.events[0].llmTaskId).toBe(state.llmTasks[0].id);
    expect(state.dims.find((d) => d.dimension === "K")).toBeUndefined();
  });

  test("LLM item G2 freezes prompt text into llm_scoring_tasks.prompt_text", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "G2",
        scoreDelta: 3,
        sourceRef: "src-g2",
        payloadText: "https://example.com 推荐这个 AI 博客,内容很硬核"
      })
    );
    expect(result.accepted).toBe(true);
    expect(state.llmTasks[0].promptText).toContain("G2 课外好资源");
    expect(state.llmTasks[0].promptText).toContain("https://example.com");
  });

  test("throws for unknown item code", () => {
    expect(() =>
      ingestor.ingest(
        ingest({ itemCode: "ZZ" as IngestInput["itemCode"], sourceRef: "src-zz" })
      )
    ).toThrow(/unknown/i);
  });

  test("runs the whole pipeline inside runInTransaction", () => {
    const deps = makeDeps(state);
    const spyIngestor = new EventIngestor(deps);
    spyIngestor.ingest(ingest({ itemCode: "K1", sourceRef: "src-tx" }));
    expect(deps.runInTransaction).toHaveBeenCalledTimes(1);
  });

  test("H2 ingest with fileKey passes it through to llm_scoring_tasks prompt payload", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "H2",
        scoreDelta: 3,
        sourceRef: "ci-h2-001",
        payload: { text: "用 Claude 写 Python 脚本", fileKey: "file_v2_xyz" }
      })
    );
    expect(result.accepted).toBe(true);
    // Verify the LLM task's prompt includes H2 reference
    expect(state.llmTasks).toHaveLength(1);
    expect(state.llmTasks[0].promptText).toContain("H2");
    // fileKey is NOT in prompt text but is in the event's payload_json
    const evt = state.events.find((e) => e.sourceRef === "ci-h2-001");
    expect(evt).toBeDefined();
    expect(JSON.parse(evt?.payloadJson as string).fileKey).toBe("file_v2_xyz");
  });

  test("stores payload as JSON in event payloadJson", () => {
    const result = ingestor.ingest(
      ingest({
        itemCode: "K3",
        scoreDelta: 3,
        sourceRef: "src-payload",
        payload: { text: "学到了 transformer 架构", extra: "metadata" }
      })
    );
    expect(result.accepted).toBe(true);
    const evt = state.events[0];
    const parsed = JSON.parse(evt.payloadJson as string);
    expect(parsed.text).toBe("学到了 transformer 架构");
    expect(parsed.extra).toBe("metadata");
  });
});
