import { aggregateSubmissionWindow } from "../../domain/submission-aggregation.js";
import { buildPendingReviewScore, scoreSubmissionCandidate } from "../../domain/scoring.js";
import { resolveSessionMatch } from "../../domain/session-windows.js";
import type { MemberProfile } from "../../domain/types.js";
import type { NormalizedFeishuMessage } from "../feishu/normalize-message.js";
import { SqliteRepository } from "../../storage/sqlite-repository.js";

function isEligibleDocument(event: NormalizedFeishuMessage) {
  return event.messageType === "file" && (event.fileExt === "pdf" || event.fileExt === "docx");
}

const parseFailureReason = "文档解析失败，已转入人工复核";

export async function evaluateMessageWindow(
  repository: SqliteRepository,
  member: MemberProfile,
  event: NormalizedFeishuMessage
) {
  const sessions = repository.listSessions(member.campId);
  const sessionMatch = resolveSessionMatch(
    {
      eventTime: event.eventTime,
      parsedTags: event.parsedTags,
      isEligibleDocument: isEligibleDocument(event)
    },
    sessions
  );
  const session = sessionMatch.session;

  const eventId = `${event.memberId}:${event.messageId}`;
  const parseStatus =
    sessionMatch.reason === "ambiguous_window"
      ? "pending_review_ambiguous_session"
      : session
        ? event.documentParseStatus === "failed"
          ? "pending_review_parse_failed"
          : "parsed"
        : "ignored_no_active_session";

  repository.insertRawEvent({
    id: eventId,
    campId: member.campId,
    chatId: event.chatId ?? "",
    memberId: event.memberId,
    sessionId: session?.id,
    messageId: event.messageId,
    messageType: event.messageType,
    rawText: event.rawText,
    parsedTags: event.parsedTags,
    attachmentCount: event.attachmentCount,
    attachmentTypes: event.attachmentTypes,
    fileKey: event.fileKey,
    fileName: event.fileName,
    fileExt: event.fileExt,
    mimeType: event.mimeType,
    documentText: event.documentText,
    documentParseStatus: event.documentParseStatus,
    documentParseReason: event.documentParseReason,
    eventTime: event.eventTime,
    eventUrl: event.eventUrl,
    parseStatus
  });

  if (!session) {
    return {
      accepted: false,
      reason:
        sessionMatch.reason === "ambiguous_window"
          ? "pending_review_ambiguous_session"
          : "ignored_no_active_session"
    };
  }

  if (event.messageType === "file" && event.documentParseStatus === "unsupported") {
    return {
      accepted: false,
      reason: "unsupported_document"
    };
  }

  const events = repository.listRawEventsForWindow(
    member.id,
    session.id,
    session.windowStart,
    session.windowEnd
  );
  const attempts = aggregateSubmissionWindow({
    member,
    session,
    events
  });
  const attempt = isEligibleDocument(event)
    ? attempts.find((entry) => entry.messageId === event.messageId)
    : attempts.at(-1);

  if (!attempt) {
    return {
      accepted: false,
      reason: "ignored_no_active_session"
    };
  }

  repository.saveAttempt(attempt);

  if (!isEligibleDocument(event)) {
    return {
      accepted: false,
      reason: "ignored_non_document_message",
      sessionId: session.id,
      candidateId: attempt.id
    };
  }

  if (event.messageType === "file" && event.documentParseStatus === "failed") {
    const pendingReview = buildPendingReviewScore(
      attempt,
      "pending_review_parse_failed",
      parseFailureReason
    );
    repository.saveScore(member.campId, pendingReview);
    const warnings = repository.syncMemberWarnings(member.campId, member.id);

    return {
      accepted: false,
      reason: "pending_review_parse_failed",
      sessionId: session.id,
      candidateId: attempt.id,
      warningLevel: warnings.at(-1)?.level ?? null,
      latestWarningId: warnings.at(-1)?.id ?? null
    };
  }

  const score = await scoreSubmissionCandidate(attempt);
  repository.saveScore(member.campId, score);
  const warnings = repository.syncMemberWarnings(member.campId, member.id);

  return {
    accepted: true,
    sessionId: session.id,
    finalStatus: score.finalStatus,
    totalScore: score.totalScore,
    candidateId: attempt.id,
    warningLevel: warnings.at(-1)?.level ?? null,
    latestWarningId: warnings.at(-1)?.id ?? null
  };
}
