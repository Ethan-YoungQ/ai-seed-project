import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import type { DocumentParseStatus } from "../../domain/types";
import { inferDocumentFileExt } from "./file-format";

export interface DocumentExtractionInput {
  fileName?: string;
  fileExt?: string;
  mimeType?: string;
  bytes: Buffer;
}

export interface DocumentExtractionResult {
  text: string;
  status: DocumentParseStatus;
  reason?: string;
}

export interface DocumentTextExtractor {
  extract(input: DocumentExtractionInput): Promise<DocumentExtractionResult>;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export class LocalDocumentTextExtractor implements DocumentTextExtractor {
  async extract(input: DocumentExtractionInput): Promise<DocumentExtractionResult> {
    const ext =
      input.fileExt?.toLowerCase() ??
      inferDocumentFileExt({
        fileName: input.fileName,
        mimeType: input.mimeType
      })?.toLowerCase();

    if (ext !== "pdf" && ext !== "docx") {
      return {
        text: "",
        status: "unsupported",
        reason: ext ? `unsupported_extension:${ext}` : "missing_extension"
      };
    }

    try {
      if (ext === "pdf") {
        const parsed = await pdfParse(input.bytes);
        return {
          text: normalizeWhitespace(parsed.text ?? ""),
          status: "parsed"
        };
      }

      const parsed = await mammoth.extractRawText({
        buffer: input.bytes
      });

      return {
        text: normalizeWhitespace(parsed.value ?? ""),
        status: "parsed"
      };
    } catch (error) {
      return {
        text: "",
        status: "failed",
        reason: error instanceof Error ? error.message : "document_parse_failed"
      };
    }
  }
}
