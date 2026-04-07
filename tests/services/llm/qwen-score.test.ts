import { describe, expect, it, vi } from "vitest";

import type { SubmissionAttempt } from "../../../src/domain/types";
import { extractTextWithQwenDoc, scoreAttemptWithQwen } from "../../../src/services/llm/qwen-score";
import type { LlmProviderConfig } from "../../../src/services/llm/provider-config";

const config: LlmProviderConfig = {
  enabled: true,
  provider: "aliyun",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: "sk-demo",
  textModel: "qwen3-flash",
  fileModel: "qwen-doc-turbo",
  timeoutMs: 15000,
  maxInputChars: 6000,
  concurrency: 3
};

const attempt: SubmissionAttempt = {
  id: "session-01:member-01:om_001",
  campId: "camp-01",
  sessionId: "session-01",
  memberId: "member-01",
  homeworkTag: "#HW01",
  eventId: "evt-1",
  messageId: "om_001",
  eventIds: ["evt-1"],
  fileKey: "file_001",
  combinedText: "I wrote a prompt, iterated twice, and produced a structured summary.",
  attachmentCount: 1,
  attachmentTypes: ["file"],
  documentText: "I wrote a prompt, iterated twice, and produced a structured summary.",
  documentParseStatus: "parsed",
  firstEventTime: "2026-04-10T08:00:00.000Z",
  latestEventTime: "2026-04-10T08:00:00.000Z",
  deadlineAt: "2026-04-17T08:59:59.000Z",
  evaluationWindowEnd: "2026-04-17T08:59:59.000Z"
};

describe("qwen routing", () => {
  it("scores a submission through the OpenAI-compatible chat API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "qwen3-flash",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  processScore: 3,
                  qualityScore: 2,
                  reason: "Clear process and strong output."
                })
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const result = await scoreAttemptWithQwen(attempt, config, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      processScore: 3,
      qualityScore: 2,
      reason: "Clear process and strong output.",
      model: "qwen3-flash"
    });
  });

  it("uploads a file and extracts plain text through the document model", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "file-fe-001",
            filename: "submission.pdf",
            purpose: "file-extract",
            status: "processed"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "qwen-doc-turbo",
            choices: [
              {
                message: {
                  content: "Extracted plain text from the document."
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );

    const result = await extractTextWithQwenDoc(
      {
        bytes: Buffer.from("fake-pdf"),
        fileName: "submission.pdf"
      },
      config,
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      fileId: "file-fe-001",
      model: "qwen-doc-turbo",
      text: "Extracted plain text from the document."
    });
  });
});
