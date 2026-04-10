/**
 * GET /api/v2/llm/worker/status — LLM worker monitoring endpoint.
 *
 * Not admin-gated: exposes only non-sensitive operational metrics
 * (running state, queue depth, heartbeat). No PII or scoring decisions.
 *
 * The status shape mirrors `LlmScoringWorker.getStatus()` from Phase E.
 */
import type { FastifyInstance } from "fastify";
import type { V2Runtime } from "../../app.js";

export function registerV2LlmStatusRoute(
  app: FastifyInstance,
  deps: V2Runtime
): void {
  app.get("/api/v2/llm/worker/status", async (_request, reply) => {
    try {
      const worker = deps.llmWorker as {
        getStatus(): {
          running: boolean;
          concurrency: number;
          activeTasks: number;
          queueDepth: number;
          lastHeartbeatAt: string | null;
        };
      };
      const status = worker.getStatus();
      return reply.send({ ok: true, status });
    } catch (err) {
      return reply.code(500).send({ ok: false, code: "internal_error" });
    }
  });
}
