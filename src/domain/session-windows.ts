import type { SessionDefinition } from "./types";

interface SessionLookupInput {
  eventTime: string;
  parsedTags: string[];
  isEligibleDocument?: boolean;
}

export interface SessionMatchResult {
  session?: SessionDefinition;
  reason: "matched_tag" | "matched_active_document_window" | "no_matching_session" | "ambiguous_window";
}

export function resolveSessionMatch(
  input: SessionLookupInput,
  sessions: SessionDefinition[]
): SessionMatchResult {
  const eventAt = new Date(input.eventTime).getTime();
  const inWindow = sessions.filter((session) => {
    const windowStart = new Date(session.windowStart).getTime();
    const windowEnd = new Date(session.windowEnd).getTime();

    return eventAt >= windowStart && eventAt <= windowEnd;
  });
  const tagged = inWindow.filter((session) => input.parsedTags.includes(session.homeworkTag));

  if (tagged.length > 0) {
    return {
      session: tagged[0],
      reason: "matched_tag"
    };
  }

  if (!input.isEligibleDocument) {
    return {
      reason: "no_matching_session"
    };
  }

  if (inWindow.length === 1) {
    return {
      session: inWindow[0],
      reason: "matched_active_document_window"
    };
  }

  if (inWindow.length > 1) {
    return {
      reason: "ambiguous_window"
    };
  }

  return {
    reason: "no_matching_session"
  };
}

export function resolveSessionForEvent(
  input: SessionLookupInput,
  sessions: SessionDefinition[]
): SessionDefinition | undefined {
  return resolveSessionMatch(input, sessions).session;
}
