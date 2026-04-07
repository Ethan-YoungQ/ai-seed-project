import type { MemberProfile, RawMessageEvent, SessionDefinition, SubmissionAttempt } from "./types";

interface AggregateInput {
  member: MemberProfile;
  session: SessionDefinition;
  events: RawMessageEvent[];
}

function isDocumentAttempt(event: RawMessageEvent) {
  return event.messageType === "file" && (event.fileExt === "pdf" || event.fileExt === "docx");
}

function buildAttemptId(sessionId: string, memberId: string, messageId: string) {
  return `${sessionId}:${memberId}:${messageId}`;
}

function buildDocumentAttempt(
  member: MemberProfile,
  session: SessionDefinition,
  event: RawMessageEvent
): SubmissionAttempt {
  return {
    id: buildAttemptId(session.id, member.id, event.messageId),
    campId: session.campId,
    sessionId: session.id,
    memberId: member.id,
    homeworkTag: session.homeworkTag,
    eventId: event.id,
    messageId: event.messageId,
    eventIds: [event.id],
    fileKey: event.fileKey,
    combinedText: event.rawText.trim(),
    attachmentCount: event.attachmentCount,
    attachmentTypes: event.attachmentTypes,
    documentText: event.documentText?.trim() ?? "",
    documentParseStatus: event.documentParseStatus ?? "not_applicable",
    firstEventTime: event.eventTime,
    latestEventTime: event.eventTime,
    deadlineAt: session.deadlineAt,
    evaluationWindowEnd: session.windowEnd
  };
}

export function aggregateSubmissionWindow(input: AggregateInput): SubmissionAttempt[] {
  const sortedEvents = [...input.events].sort((left, right) =>
    left.eventTime.localeCompare(right.eventTime)
  );

  const documentEvents = sortedEvents.filter(isDocumentAttempt);
  return documentEvents.map((event) => buildDocumentAttempt(input.member, input.session, event));
}
