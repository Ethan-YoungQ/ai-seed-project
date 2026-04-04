import type { SessionDefinition } from "./types";

interface SessionLookupInput {
  eventTime: string;
  parsedTags: string[];
}

export function resolveSessionForEvent(
  input: SessionLookupInput,
  sessions: SessionDefinition[]
): SessionDefinition | undefined {
  const eventAt = new Date(input.eventTime).getTime();

  return sessions.find((session) => {
    if (!input.parsedTags.includes(session.homeworkTag)) {
      return false;
    }

    const windowStart = new Date(session.windowStart).getTime();
    const windowEnd = new Date(session.windowEnd).getTime();

    return eventAt >= windowStart && eventAt <= windowEnd;
  });
}
