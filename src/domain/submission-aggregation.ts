import type { MemberProfile, RawMessageEvent, SessionDefinition, SubmissionCandidate } from "./types";

interface AggregateInput {
  member: MemberProfile;
  session: SessionDefinition;
  events: RawMessageEvent[];
}

export function aggregateSubmissionWindow(input: AggregateInput): SubmissionCandidate {
  const sortedEvents = [...input.events].sort((left, right) =>
    left.eventTime.localeCompare(right.eventTime)
  );

  return {
    id: `${input.session.id}:${input.member.id}`,
    campId: input.session.campId,
    sessionId: input.session.id,
    memberId: input.member.id,
    homeworkTag: input.session.homeworkTag,
    eventIds: sortedEvents.map((event) => event.id),
    combinedText: sortedEvents.map((event) => event.rawText.trim()).join("\n"),
    attachmentCount: sortedEvents.reduce((sum, event) => sum + event.attachmentCount, 0),
    attachmentTypes: [...new Set(sortedEvents.flatMap((event) => event.attachmentTypes))],
    firstEventTime: sortedEvents[0]?.eventTime ?? input.session.windowStart,
    latestEventTime: sortedEvents.at(-1)?.eventTime ?? input.session.windowStart,
    deadlineAt: input.session.deadlineAt,
    evaluationWindowEnd: input.session.windowEnd
  };
}
