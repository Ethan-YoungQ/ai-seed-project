import { describe, expect, it, vi } from "vitest";

import { LocalDocumentTextExtractor } from "../../../src/services/documents/extract-text";

describe("LocalDocumentTextExtractor fallback", () => {
  it("uses the injected LLM fallback when local parsing fails", async () => {
    const extractor = new LocalDocumentTextExtractor({
      localPdfParser: async () => {
        throw new Error("local_pdf_failed");
      },
      llmFallback: async () => ({
        text: "Recovered text from the document model.",
        status: "parsed",
        reason: "qwen_doc_fallback"
      })
    });

    const result = await extractor.extract({
      fileName: "submission.pdf",
      fileExt: "pdf",
      bytes: Buffer.from("fake-pdf")
    });

    expect(result).toMatchObject({
      text: "Recovered text from the document model.",
      status: "parsed",
      reason: "qwen_doc_fallback"
    });
  });

  it("keeps a failed status when both local parsing and fallback fail", async () => {
    const llmFallback = vi.fn(async () => undefined);
    const extractor = new LocalDocumentTextExtractor({
      localPdfParser: async () => {
        throw new Error("local_pdf_failed");
      },
      llmFallback
    });

    const result = await extractor.extract({
      fileName: "submission.pdf",
      fileExt: "pdf",
      bytes: Buffer.from("fake-pdf")
    });

    expect(llmFallback).toHaveBeenCalledOnce();
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("local_pdf_failed");
  });
});
