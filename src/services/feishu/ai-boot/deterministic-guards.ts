import type { EvidenceBundle } from "./content-extractor.js";

export interface GuardContext {
  roleType: string;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  mentionedBot: boolean;
  dailyParticipationAlreadyScored: boolean;
  categoryCapRemaining: number | null;
  duplicateApprovedContent: boolean;
  duplicateContent?: boolean;
}

export type GuardOutcome =
  | { kind: "continue" }
  | { kind: "daily_participation"; reason: string }
  | { kind: "ignore"; reason: string }
  | { kind: "no_score"; reason: string }
  | { kind: "review_required"; reason: string };

const STUDENT_ROLE = "student";
const TRIVIAL_TEXTS = new Set([
  "ok",
  "okay",
  "OK",
  "Okay",
  "谢谢",
  "感谢",
  "多谢",
  "收到",
  "好的",
  "好",
]);

const EMOJI_ONLY_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+$/u;
const PURE_LINK_REMAINDER_RE = /^[\s.,;:!?，。！？；、：…()[\]{}（）【】《》「」『』"'“”‘’<>-]*$/u;

export function runDeterministicGuards(
  evidence: EvidenceBundle,
  context: GuardContext,
): GuardOutcome {
  if (context.roleType.trim().toLowerCase() !== STUDENT_ROLE) {
    return { kind: "ignore", reason: "non_student_role" };
  }

  if (!context.isParticipant) {
    return { kind: "ignore", reason: "not_participant" };
  }

  if (context.isExcludedFromBoard) {
    return { kind: "ignore", reason: "excluded_from_board" };
  }

  if (context.mentionedBot) {
    return { kind: "ignore", reason: "mentioned_bot" };
  }

  if (context.categoryCapRemaining === 0) {
    return { kind: "no_score", reason: "category_cap_reached" };
  }

  if (context.duplicateApprovedContent) {
    return { kind: "ignore", reason: "duplicate_approved_content" };
  }

  if (context.duplicateContent) {
    return { kind: "review_required", reason: "duplicate_content" };
  }

  if (isTrivialOnly(evidence.sanitizedText)) {
    if (context.dailyParticipationAlreadyScored) {
      return { kind: "ignore", reason: "trivial_chat_daily_cap_used" };
    }

    return { kind: "daily_participation", reason: "trivial_chat" };
  }

  if (isPureLinkWithoutReason(evidence)) {
    return { kind: "no_score", reason: "pure_link_without_reason" };
  }

  return { kind: "continue" };
}

function isTrivialOnly(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return false;
  }

  return TRIVIAL_TEXTS.has(normalized) || EMOJI_ONLY_RE.test(normalized);
}

function isPureLinkWithoutReason(evidence: EvidenceBundle): boolean {
  if (evidence.urls.length === 0) {
    return false;
  }

  let remainder = evidence.sanitizedText.trim();
  const urlsByDescendingLength = [...evidence.urls].sort((left, right) => right.length - left.length);
  for (const url of urlsByDescendingLength) {
    remainder = remainder.split(url).join("");
  }

  return remainder.length < evidence.sanitizedText.trim().length
    && PURE_LINK_REMAINDER_RE.test(remainder);
}
