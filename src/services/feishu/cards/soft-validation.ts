export const MIN_TEXT_LENGTH = 20;

export type SoftValidationResult =
  | { ok: true }
  | { ok: false; reason: "text_too_short" | "missing_url" | "missing_file_key" };

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const WHITESPACE_REGEX = /\s+/g;

export function stripEmojiAndSpace(text: string): string {
  return text.replace(EMOJI_REGEX, "").replace(WHITESPACE_REGEX, "");
}

function isSubstantiveText(text: string): boolean {
  const stripped = stripEmojiAndSpace(text);
  return stripped.length >= MIN_TEXT_LENGTH;
}

/**
 * Validates a generic LLM-scored text payload (K3/K4/C1/C3).
 */
export function validateLlmSubmission(input: { text: string }): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  return { ok: true };
}

const URL_REGEX = /https?:\/\/[^\s]+/i;

/**
 * G2 requires at least one http(s) URL alongside the text description.
 */
export function validateG2Submission(input: { text: string }): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  if (!URL_REGEX.test(input.text)) {
    return { ok: false, reason: "missing_url" };
  }
  return { ok: true };
}

/**
 * H2 requires both a descriptive text body and a non-empty file_key.
 */
export function validateH2Submission(input: {
  text: string;
  fileKey: string;
}): SoftValidationResult {
  if (!isSubstantiveText(input.text)) {
    return { ok: false, reason: "text_too_short" };
  }
  if (!input.fileKey || input.fileKey.trim() === "") {
    return { ok: false, reason: "missing_file_key" };
  }
  return { ok: true };
}
