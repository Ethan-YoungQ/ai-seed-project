import type { MemberProfile, SessionDefinition } from "../domain/types.js";

export const demoCamp = {
  id: "camp-demo",
  name: "Pfizer HBU AI Bootcamp",
  groupId: "chat-demo",
  startDate: "2026-04-03T09:00:00.000Z",
  endDate: "2026-06-26T09:00:00.000Z",
  status: "active"
} as const;

export const defaultTags = [
  "#HW01",
  "#HW02",
  "#HW03",
  "#\u4f5c\u4e1a\u63d0\u4ea4",
  "#\u65b0\u624b\u907f\u5751",
  "#Prompt\u6284\u4f5c\u4e1a",
  "#\u795e\u5947\u63d2\u4ef6",
  "#\u6211\u6765\u5e2e\u5fd9"
] as const;

export const demoSessions: SessionDefinition[] = [
  {
    id: "session-01",
    campId: demoCamp.id,
    title: "Kickoff",
    homeworkTag: "#HW01",
    courseDate: "2026-04-03T09:00:00.000Z",
    deadlineAt: "2026-04-17T08:59:59.000Z",
    windowStart: "2026-04-03T09:00:00.000Z",
    windowEnd: "2026-04-17T08:59:59.000Z",
    cycleType: "biweekly",
    active: true
  },
  {
    id: "session-02",
    campId: demoCamp.id,
    title: "Prompt Iteration",
    homeworkTag: "#HW02",
    courseDate: "2026-04-17T09:00:00.000Z",
    deadlineAt: "2026-05-01T08:59:59.000Z",
    windowStart: "2026-04-17T09:00:00.000Z",
    windowEnd: "2026-05-01T08:59:59.000Z",
    cycleType: "biweekly",
    active: true
  },
  {
    id: "session-03",
    campId: demoCamp.id,
    title: "Workflow Automation",
    homeworkTag: "#HW03",
    courseDate: "2026-05-01T09:00:00.000Z",
    deadlineAt: "2026-05-15T08:59:59.000Z",
    windowStart: "2026-05-01T09:00:00.000Z",
    windowEnd: "2026-05-15T08:59:59.000Z",
    cycleType: "biweekly",
    active: true
  }
];

export const demoMembers: MemberProfile[] = [
  {
    id: "user-alice",
    campId: demoCamp.id,
    name: "Alice",
    department: "HBU",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    status: "active"
  },
  {
    id: "user-ops",
    campId: demoCamp.id,
    name: "Operator",
    department: "Ops",
    roleType: "operator",
    isParticipant: false,
    isExcludedFromBoard: true,
    status: "active"
  }
];
