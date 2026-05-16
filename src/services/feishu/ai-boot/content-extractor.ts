import { createHash } from "node:crypto";

import {
  createLocalDocumentTextExtractor,
  type DocumentTextExtractor,
} from "../document-text-extractor.js";
import type { NormalizedFeishuMessage } from "../normalize-message.js";

export interface EvidenceBundle {
  sanitizedText: string;
  urls: string[];
  attachments: Array<{ type: string; fileKey?: string; fileName?: string; fileExt?: string }>;
  documentText: string;
  extractionStatus: "not_applicable" | "parsed" | "unsupported" | "failed";
  extractionReason: string;
  contentHash: string;
}

interface MessageFile {
  bytes: Buffer;
  fileKey?: string;
  fileName?: string;
  fileExt?: string;
  mimeType?: string;
}

interface FeishuFileClient {
  getMessageFile(input: {
    messageId: string;
    fileKey: string;
    fileName?: string;
  }): Promise<MessageFile>;
}

export interface ExtractEvidenceOptions {
  feishuClient?: FeishuFileClient;
  documentExtractor?: DocumentTextExtractor;
}

type ExtractionState = Pick<EvidenceBundle, "documentText" | "extractionStatus" | "extractionReason">;

const URL_RE = /https?:\/\/[^\s<>"'，。！？；、：…]+/g;
const ALWAYS_TRAILING_URL_PUNCTUATION = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  "。",
  "！",
  "？",
  "；",
  "、",
  "，",
  "：",
  "…",
]);
const CLOSING_DELIMITER_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "）": "（",
  "】": "【",
  "》": "《",
  "」": "「",
  "』": "『",
  "”": "“",
  "’": "‘",
};
const FEISHU_AT_RE = /<at\b[^>]*>.*?<\/at>/g;
const RAW_MENTION_RE = /@_user_\d+/g;
const ATTACHMENT_MESSAGE_TYPES = new Set(["image", "file", "media"]);
const SUPPORTED_DOCUMENT_EXTS = new Set(["pdf", "docx"]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeText(message: NormalizedFeishuMessage): string {
  const source = message.cleanedText || message.rawText;
  return normalizeWhitespace(source.replace(FEISHU_AT_RE, "").replace(RAW_MENTION_RE, ""));
}

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = trimUrlBoundaryPunctuation(match[0]);
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function countChar(value: string, target: string): number {
  return [...value].filter((char) => char === target).length;
}

function hasUnmatchedClosingDelimiter(value: string, close: string): boolean {
  const open = CLOSING_DELIMITER_PAIRS[close];
  return Boolean(open) && countChar(value, close) > countChar(value, open);
}

function trimUrlBoundaryPunctuation(value: string): string {
  let url = value;

  while (url.length > 0) {
    const lastChar = [...url].at(-1);
    if (!lastChar) break;

    if (ALWAYS_TRAILING_URL_PUNCTUATION.has(lastChar)) {
      url = url.slice(0, -lastChar.length);
      continue;
    }

    if (hasUnmatchedClosingDelimiter(url, lastChar)) {
      url = url.slice(0, -lastChar.length);
      continue;
    }

    break;
  }

  return url;
}

function shouldIncludeAttachment(message: NormalizedFeishuMessage): boolean {
  return Boolean(
    (message.messageType && ATTACHMENT_MESSAGE_TYPES.has(message.messageType)) ||
      message.attachmentTypes.length > 0
  );
}

function buildAttachments(message: NormalizedFeishuMessage): EvidenceBundle["attachments"] {
  if (!shouldIncludeAttachment(message)) {
    return [];
  }

  const types = message.messageType && ATTACHMENT_MESSAGE_TYPES.has(message.messageType)
    ? [message.messageType]
    : [...new Set(message.attachmentTypes)];

  return (types.length > 0 ? types : ["attachment"]).map((type) => {
    const attachment: EvidenceBundle["attachments"][number] = { type };
    if (message.fileKey) attachment.fileKey = message.fileKey;
    if (message.fileName) attachment.fileName = message.fileName;
    if (message.fileExt) attachment.fileExt = message.fileExt;
    return attachment;
  });
}

function isSupportedDocumentFile(message: NormalizedFeishuMessage): boolean {
  return message.messageType === "file" &&
    Boolean(message.fileKey) &&
    Boolean(message.fileExt && SUPPORTED_DOCUMENT_EXTS.has(message.fileExt.toLowerCase()));
}

function buildHash(input: {
  sanitizedText: string;
  urls: string[];
  attachments: EvidenceBundle["attachments"];
  documentText: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function canonicalizeAttachmentsForHash(
  attachments: EvidenceBundle["attachments"],
): EvidenceBundle["attachments"] {
  return [...attachments].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

async function extractDocumentEvidence(
  message: NormalizedFeishuMessage,
  options: ExtractEvidenceOptions,
): Promise<ExtractionState> {
  if (message.messageType !== "file") {
    return {
      documentText: "",
      extractionStatus: "not_applicable",
      extractionReason: "non_file_message",
    };
  }

  if (message.documentParseStatus === "parsed" && message.documentText) {
    return {
      documentText: message.documentText,
      extractionStatus: "parsed",
      extractionReason: "existing_document_text",
    };
  }

  if (!message.fileKey) {
    return {
      documentText: "",
      extractionStatus: "failed",
      extractionReason: "missing_file_key",
    };
  }

  if (!isSupportedDocumentFile(message)) {
    return {
      documentText: "",
      extractionStatus: "unsupported",
      extractionReason: `unsupported_file_ext:${message.fileExt ?? "unknown"}`,
    };
  }

  if (!options.feishuClient) {
    return {
      documentText: "",
      extractionStatus: "failed",
      extractionReason: "missing_feishu_client",
    };
  }

  try {
    const file = await options.feishuClient.getMessageFile({
      messageId: message.messageId,
      fileKey: message.fileKey,
      fileName: message.fileName,
    });
    const extractor = options.documentExtractor ?? createLocalDocumentTextExtractor();
    const extraction = await extractor.extract({
      bytes: file.bytes,
      fileExt: file.fileExt ?? message.fileExt,
      fileName: file.fileName ?? message.fileName,
      mimeType: file.mimeType ?? message.mimeType,
    });

    return {
      documentText: extraction.status === "parsed" ? extraction.text : "",
      extractionStatus: extraction.status,
      extractionReason: extraction.reason ?? extraction.status,
    };
  } catch (err) {
    return {
      documentText: "",
      extractionStatus: "failed",
      extractionReason: err instanceof Error ? err.message : "document_extraction_failed",
    };
  }
}

export async function extractEvidence(
  message: NormalizedFeishuMessage,
  options: ExtractEvidenceOptions = {},
): Promise<EvidenceBundle> {
  const sanitizedText = sanitizeText(message);
  const urls = extractUrls(sanitizedText);
  const attachments = buildAttachments(message);
  const extraction = await extractDocumentEvidence(message, options);

  return {
    sanitizedText,
    urls,
    attachments,
    ...extraction,
    contentHash: buildHash({
      sanitizedText,
      urls,
      attachments: canonicalizeAttachmentsForHash(attachments),
      documentText: extraction.documentText,
    }),
  };
}
