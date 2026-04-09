import { describe, expect, it, vi } from "vitest";

import type { SubmissionAttempt } from "../../../src/domain/types";
import { scoreAttemptWithLlm } from "../../../src/services/llm/llm-evaluator";
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

describe("llm evaluator", () => {
  it("scores a submission through the OpenAI-compatible chat API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "glm-4.7",
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

    const result = await scoreAttemptWithLlm(attempt, config, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      processScore: 3,
      qualityScore: 2,
      reason: "Clear process and strong output.",
      model: "glm-4.7"
    });
  });
});
