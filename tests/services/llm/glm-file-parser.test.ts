import { describe, expect, it, vi } from "vitest";

import { createGlmFileParserClient } from "../../../src/services/llm/glm-file-parser";
import type { LlmProviderConfig } from "../../../src/services/llm/provider-config";

const config: LlmProviderConfig = {
  enabled: true,
  provider: "glm",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "sk-demo",
  textModel: "glm-4.7",
  fileModel: "",
  fileExtractor: "glm_file_parser",
  fileParserToolType: "lite",
  timeoutMs: 15000,
  maxInputChars: 6000,
  concurrency: 3
};

describe("createGlmFileParserClient", () => {
  it("creates a parser task and fetches plain text content", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: "task-001" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response("Extracted plain text from parser.", { status: 200 }));

    const client = createGlmFileParserClient(config, { fetchImpl });
    const result = await client.parse({
      bytes: Buffer.from("fake-pdf"),
      fileName: "submission.pdf",
      fileType: "PDF",
      toolType: "lite"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      taskId: "task-001",
      text: "Extracted plain text from parser."
    });
  });

  it("throws when parser task creation does not return a task id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const client = createGlmFileParserClient(config, { fetchImpl });

    await expect(
      client.parse({
        bytes: Buffer.from("fake-pdf"),
        fileName: "submission.pdf",
        fileType: "PDF",
        toolType: "lite"
      })
    ).rejects.toThrow("missing_parser_task_id");
  });

  it("throws when parser content is empty", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: "task-001" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response("   ", { status: 200 }));

    const client = createGlmFileParserClient(config, { fetchImpl });

    await expect(
      client.parse({
        bytes: Buffer.from("fake-docx"),
        fileName: "submission.docx",
        fileType: "DOCX",
        toolType: "lite"
      })
    ).rejects.toThrow("empty_parser_content");
  });

  it("throws when parser reports a terminal failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: "task-001" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_status: "failed", error: "parser_failed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const client = createGlmFileParserClient(config, {
      fetchImpl,
      maxPollAttempts: 2,
      sleepImpl: async () => undefined
    });

    await expect(
      client.parse({
        bytes: Buffer.from("fake-pdf"),
        fileName: "submission.pdf",
        fileType: "PDF",
        toolType: "lite"
      })
    ).rejects.toThrow("parser_failed");
  });

  it("throws when parser polling times out", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: "task-001" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockImplementation(async () =>
        new Response(JSON.stringify({ task_status: "processing" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const client = createGlmFileParserClient(config, {
      fetchImpl,
      maxPollAttempts: 2,
      sleepImpl: async () => undefined
    });

    await expect(
      client.parse({
        bytes: Buffer.from("fake-pdf"),
        fileName: "submission.pdf",
        fileType: "PDF",
        toolType: "lite"
      })
    ).rejects.toThrow("parser_poll_timeout");
  });
});
