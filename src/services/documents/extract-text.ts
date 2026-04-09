import mammoth from "mammoth";
import pdfParse from "pdf-parse";

import type { DocumentParseStatus } from "../../domain/types.js";
import { readLlmProviderConfig, type LlmProviderConfig } from "../llm/provider-config.js";
import { inferDocumentFileExt } from "./file-format.js";
import { createGlmFileParserClient } from "../llm/glm-file-parser.js";

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

export interface LocalDocumentTextExtractorOptions {
  config?: LlmProviderConfig;
  fetchImpl?: typeof fetch;
  localPdfParser?: typeof pdfParse;
  localDocxParser?: typeof mammoth.extractRawText;
  llmFallback?: (input: DocumentExtractionInput) => Promise<DocumentExtractionResult | undefined>;
}

export class LocalDocumentTextExtractor implements DocumentTextExtractor {
  constructor(private readonly options: LocalDocumentTextExtractorOptions = {}) {}

  private async runLlmFallback(input: DocumentExtractionInput) {
    if (this.options.llmFallback) {
      return this.options.llmFallback(input);
    }

    const config = this.options.config ?? readLlmProviderConfig(process.env);
    if (!config.enabled) {
      return undefined;
    }

    try {
      if (config.fileExtractor !== "glm_file_parser") {
        return undefined;
      }

      const ext =
        input.fileExt?.toLowerCase() ??
        inferDocumentFileExt({
          fileName: input.fileName,
          mimeType: input.mimeType
        })?.toLowerCase();

      if (ext !== "pdf" && ext !== "docx") {
        return undefined;
      }

      const result = await createGlmFileParserClient(config, {
        fetchImpl: this.options.fetchImpl
      }).parse({
        bytes: input.bytes,
        fileName: input.fileName || `submission.${ext}`,
        fileType: ext.toUpperCase(),
        toolType: config.fileParserToolType
      });

      return {
        text: normalizeWhitespace(result.text),
        status: "parsed",
        reason: `llm_fallback:glm_file_parser:${config.fileParserToolType}:${result.taskId}`
      } satisfies DocumentExtractionResult;
    } catch {
      return undefined;
    }
  }

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
        const parsed = await (this.options.localPdfParser ?? pdfParse)(input.bytes);
        const text = normalizeWhitespace(parsed.text ?? "");
        if (text) {
          return {
            text,
            status: "parsed"
          };
        }

        const fallback = await this.runLlmFallback(input);
        if (fallback) {
          return fallback;
        }

        return {
          text: "",
          status: "failed",
          reason: "empty_document_text"
        };
      }

      const parsed = await (this.options.localDocxParser ?? mammoth.extractRawText)({
        buffer: input.bytes
      });
      const text = normalizeWhitespace(parsed.value ?? "");
      if (text) {
        return {
          text,
          status: "parsed"
        };
      }

      const fallback = await this.runLlmFallback(input);
      if (fallback) {
        return fallback;
      }

      return {
        text: "",
        status: "failed",
        reason: "empty_document_text"
      };
    } catch (error) {
      const fallback = await this.runLlmFallback(input);
      if (fallback) {
        return fallback;
      }

      return {
        text: "",
        status: "failed",
        reason: error instanceof Error ? error.message : "document_parse_failed"
      };
    }
  }
}
