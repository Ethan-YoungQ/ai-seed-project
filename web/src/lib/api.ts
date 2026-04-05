import type {
  AnnouncementPreview,
  MemberEntry,
  OperatorSubmissionEntry,
  RankingResponse,
  SnapshotEntry,
  WarningEntry
} from "../types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "请求失败");
  }

  return (await response.json()) as T;
}

export async function seedDemo() {
  const response = await fetch("/api/demo/seed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  return parseJson<{ ok: boolean }>(response);
}

export async function fetchPublicBoard() {
  const response = await fetch("/api/public-board");
  return parseJson<RankingResponse>(response);
}

export async function fetchRanking() {
  return fetchPublicBoard();
}

export async function fetchMembers() {
  const response = await fetch("/api/members");
  return parseJson<{ entries: MemberEntry[] }>(response);
}

export async function fetchOperatorSubmissions() {
  const response = await fetch("/api/operator/submissions");
  return parseJson<{ entries: OperatorSubmissionEntry[] }>(response);
}

export async function fetchWarnings() {
  const response = await fetch("/api/operator/warnings");
  return parseJson<{ entries: WarningEntry[] }>(response);
}

export async function fetchSnapshots() {
  const response = await fetch("/api/public-board/snapshots");
  return parseJson<{ entries: SnapshotEntry[] }>(response);
}

export async function updateMember(
  memberId: string,
  patch: Partial<Pick<MemberEntry, "isExcludedFromBoard" | "isParticipant" | "roleType">>
) {
  const response = await fetch(`/api/members/${memberId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return parseJson<MemberEntry>(response);
}

export async function reviewCandidate(candidateId: string, body: object) {
  const response = await fetch(`/api/reviews/${candidateId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return parseJson<unknown>(response);
}

export async function previewAnnouncement(
  type: "deadline_reminder" | "submission_summary" | "biweekly_ranking" | "status_change"
) {
  const response = await fetch("/api/announcements/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type,
      campId: "camp-demo"
    })
  });

  return parseJson<AnnouncementPreview>(response);
}

export async function runAnnouncement(
  type: "deadline_reminder" | "submission_summary" | "biweekly_ranking" | "status_change"
) {
  const response = await fetch("/api/announcements/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type,
      campId: "camp-demo",
      triggeredBy: "operator-ui"
    })
  });

  return parseJson<{ status: string; announcementId: string; snapshotId: string }>(response);
}
