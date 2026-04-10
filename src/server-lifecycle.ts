/**
 * LLM worker lifecycle helpers, extracted from server.ts so that tests
 * can exercise start/stop logic without booting the full Fastify app.
 */

interface MinimalWorker {
  start(): void;
  stop(): Promise<void>;
}

interface MinimalApp {
  close(): Promise<void>;
}

export interface LlmLifecycleDeps {
  llmWorker: MinimalWorker;
}

let stopping = false;

/**
 * Start the LLM scoring worker. Call after app.ready().
 */
export function startLlmWorker(deps: LlmLifecycleDeps): void {
  deps.llmWorker.start();
}

/**
 * Stop the LLM worker then close the app. Guarded by a module-level
 * latch so double-SIGTERM is a no-op.
 */
export async function stopLlmWorker(
  app: MinimalApp,
  deps: LlmLifecycleDeps
): Promise<void> {
  if (stopping) return;
  stopping = true;

  try {
    await deps.llmWorker.stop();
    await app.close();
  } finally {
    // Reset for test reuse — in production the process exits anyway
    stopping = false;
  }
}

/**
 * Reset the stopping latch. Only used in tests.
 */
export function resetStoppingLatch(): void {
  stopping = false;
}
