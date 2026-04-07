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

function buildLegacyAggregateAttempt(
  member: MemberProfile,
  session: SessionDefinition,
  sortedEvents: RawMessageEvent[]
): SubmissionAttempt {
  return {
    id: `${session.id}:${member.id}`,
    campId: session.campId,
    sessionId: session.id,
    memberId: member.id,
    homeworkTag: session.homeworkTag,
    eventId: sortedEvents.at(-1)?.id ?? `${session.id}:${member.id}:legacy`,
    messageId: sortedEvents.at(-1)?.messageId ?? `${session.id}:${member.id}:legacy`,
    eventIds: sortedEvents.map((event) => event.id),
    combinedText: sortedEvents.map((event) => event.rawText.trim()).filter(Boolean).join("\n"),
    attachmentCount: sortedEvents.reduce((sum, event) => sum + event.attachmentCount, 0),
    attachmentTypes: [...new Set(sortedEvents.flatMap((event) => event.attachmentTypes))],
    documentText: sortedEvents
      .map((event) => event.documentText?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n"),
    documentParseStatus: sortedEvents.some((event) => event.documentParseStatus === "failed")
      ? "failed"
      : sortedEvents.some((event) => event.documentParseStatus === "parsed")
        ? "parsed"
        : sortedEvents.some((event) => event.documentParseStatus === "unsupported")
          ? "unsupported"
          : sortedEvents.some((event) => event.documentParseStatus === "pending")
            ? "pending"
            : "not_applicable",
    firstEventTime: sortedEvents[0]?.eventTime ?? session.windowStart,
    latestEventTime: sortedEvents.at(-1)?.eventTime ?? session.windowStart,
    deadlineAt: session.deadlineAt,
    evaluationWindowEnd: session.windowEnd
  };
}

export function aggregateSubmissionWindow(input: AggregateInput): SubmissionAttempt[] {
  const sortedEvents = [...input.events].sort((left, right) =>
    left.eventTime.localeCompare(right.eventTime)
  );

  const documentEvents = sortedEvents.filter(isDocumentAttempt);
  if (documentEvents.length > 0) {
    return documentEvents.map((event) => buildDocumentAttempt(input.member, input.session, event));
  }

  if (sortedEvents.length === 0) {
    return [];
  }

  return [buildLegacyAggregateAttempt(input.member, input.session, sortedEvents)];
}
