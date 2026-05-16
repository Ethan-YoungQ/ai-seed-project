import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export interface DocumentExtractionResult {
  status: "parsed" | "unsupported" | "failed";
  text: string;
  reason?: string;
}

export interface DocumentTextExtractor {
  extract(input: {
    bytes: Buffer;
    fileExt?: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<DocumentExtractionResult>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createLocalDocumentTextExtractor(): DocumentTextExtractor {
  return {
    async extract(input): Promise<DocumentExtractionResult> {
      const fileExt = input.fileExt?.toLowerCase() || input.fileName?.split(".").at(-1)?.toLowerCase();
      try {
        if (fileExt === "pdf") {
          const parsed = await pdfParse(input.bytes);
          return {
            status: "parsed",
            text: normalizeText(parsed.text ?? ""),
          };
        }

        if (fileExt === "docx") {
          const parsed = await mammoth.extractRawText({ buffer: input.bytes });
          return {
            status: "parsed",
            text: normalizeText(parsed.value ?? ""),
          };
        }

        return {
          status: "unsupported",
          text: "",
          reason: `unsupported_file_ext:${fileExt ?? "unknown"}`,
        };
      } catch (err) {
        return {
          status: "failed",
          text: "",
          reason: err instanceof Error ? err.message : "document_extract_failed",
        };
      }
    },
  };
}
