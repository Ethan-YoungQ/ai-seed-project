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

function extractHtmlText(bytes: Buffer): string {
  const html = bytes.toString("utf8");
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeText(decodeBasicHtmlEntities(withBreaks));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
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

        if (fileExt === "html" || fileExt === "htm") {
          return {
            status: "parsed",
            text: extractHtmlText(input.bytes),
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
