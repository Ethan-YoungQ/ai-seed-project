export interface LlmScoringResult {
  pass: boolean;
  score: number;
  reason: string;
  raw: unknown;
}

export interface LlmScoringOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  score(promptText: string, options: LlmScoringOptions): Promise<LlmScoringResult>;
}

export type FakeProviderFn = (prompt: string) => Promise<LlmScoringResult> | LlmScoringResult;

export interface FakeLlmScoringClientOptions {
  responses?: LlmScoringResult[];
  provider?: FakeProviderFn;
  delayMs?: number;
  provider_name?: string;
  model?: string;
}

export class FakeLlmScoringClient implements LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  private readonly queue: LlmScoringResult[];
  private readonly providerFn: FakeProviderFn | null;
  private readonly delayMs: number;

  constructor(options: FakeLlmScoringClientOptions) {
    this.provider = options.provider_name ?? "fake";
    this.model = options.model ?? "fake-v1";
    this.queue = options.responses ? [...options.responses] : [];
    this.providerFn = options.provider ?? null;
    this.delayMs = options.delayMs ?? 0;
  }

  async score(
    promptText: string,
    _options: LlmScoringOptions
  ): Promise<LlmScoringResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.providerFn) {
      return await this.providerFn(promptText);
    }
    const next = this.queue.shift();
    if (!next) {
      throw new Error("fake queue exhausted");
    }
    return next;
  }
}
