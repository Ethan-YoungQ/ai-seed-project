import { aggregateSubmissionWindow } from "../../domain/submission-aggregation";
import { scoreSubmissionCandidate } from "../../domain/scoring";
import { resolveSessionForEvent } from "../../domain/session-windows";
import type { MemberProfile } from "../../domain/types";
import type { NormalizedFeishuMessage } from "../feishu/normalize-message";
import { SqliteRepository } from "../../storage/sqlite-repository";

export async function evaluateMessageWindow(
  repository: SqliteRepository,
  member: MemberProfile,
  event: NormalizedFeishuMessage
) {
  const sessions = repository.listSessions(member.campId);
  const session = resolveSessionForEvent(
    {
      eventTime: event.eventTime,
      parsedTags: event.parsedTags
    },
    sessions
  );

  const eventId = `${event.memberId}:${event.messageId}`;
  repository.insertRawEvent({
    id: eventId,
    campId: member.campId,
    chatId: event.chatId ?? "",
    memberId: event.memberId,
    sessionId: session?.id,
    messageId: event.messageId,
    rawText: event.rawText,
    parsedTags: event.parsedTags,
    attachmentCount: event.attachmentCount,
    attachmentTypes: event.attachmentTypes,
    eventTime: event.eventTime,
    eventUrl: event.eventUrl,
    parseStatus: session ? "parsed" : "ignored"
  });

  if (!session) {
    return {
      accepted: false,
      reason: "no_matching_session"
    };
  }

  const events = repository.listRawEventsForWindow(
    member.id,
    session.id,
    session.windowStart,
    session.windowEnd
  );

  const candidate = aggregateSubmissionWindow({
    member,
    session,
    events
  });
  repository.saveCandidate(candidate);

  const score = await scoreSubmissionCandidate(candidate);
  repository.saveScore(member.campId, score);
  const warnings = repository.syncMemberWarnings(member.campId, member.id);

  return {
    accepted: true,
    sessionId: session.id,
    finalStatus: score.finalStatus,
    totalScore: score.totalScore,
    candidateId: candidate.id,
    warningLevel: warnings.at(-1)?.level ?? null,
    latestWarningId: warnings.at(-1)?.id ?? null
  };
}
