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

function appendAttemptMessage(attempt: SubmissionAttempt, event: RawMessageEvent) {
  const text = event.rawText.trim();

  if (text) {
    attempt.combinedText = attempt.combinedText ? `${attempt.combinedText}\n\n${text}` : text;
  }

  attempt.eventIds = [...attempt.eventIds, event.id];
  if (event.eventTime.localeCompare(attempt.firstEventTime) < 0) {
    attempt.firstEventTime = event.eventTime;
  }
  if (event.eventTime.localeCompare(attempt.latestEventTime) > 0) {
    attempt.latestEventTime = event.eventTime;
  }
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

  const attempts: SubmissionAttempt[] = [];
  let pendingMessages: RawMessageEvent[] = [];

  for (const event of sortedEvents) {
    if (isDocumentAttempt(event)) {
      const attempt = buildDocumentAttempt(input.member, input.session, event);
      for (const pendingMessage of pendingMessages) {
        appendAttemptMessage(attempt, pendingMessage);
      }
      pendingMessages = [];
      attempts.push(attempt);
      continue;
    }

    const currentAttempt = attempts.at(-1);
    if (currentAttempt) {
      appendAttemptMessage(currentAttempt, event);
      continue;
    }

    pendingMessages.push(event);
  }

  return attempts;
}
