import type { CardActionContext, FeishuCardJson } from "./types.js";

/** Feishu's hard size limit for a single card payload. */
export const CARD_SIZE_LIMIT_BYTES = 30 * 1024;

/** Our internal soft budget with a safety margin. */
export const CARD_SIZE_BUDGET_BYTES = 25 * 1024;

export type TemplateBuilder<TState = unknown> = (
  state: TState,
  ctx: CardActionContext
) => FeishuCardJson;

const registry = new Map<string, TemplateBuilder<unknown>>();

export function registerTemplate<TState>(
  templateId: string,
  builder: TemplateBuilder<TState>
): void {
  registry.set(templateId, builder as TemplateBuilder<unknown>);
}

export function clearTemplateRegistry(): void {
  registry.clear();
}

export function renderCard<TState>(
  templateId: string,
  state: TState,
  ctx: CardActionContext
): FeishuCardJson {
  const builder = registry.get(templateId);
  if (!builder) {
    throw new Error(`template not registered: ${templateId}`);
  }
  const card = (builder as TemplateBuilder<TState>)(state, ctx);
  assertCardSize(card);
  return card;
}

export function assertCardSize(card: FeishuCardJson): void {
  const size = Buffer.byteLength(JSON.stringify(card), "utf8");
  if (size > CARD_SIZE_BUDGET_BYTES) {
    throw new Error(
      `card payload exceeds ${CARD_SIZE_BUDGET_BYTES} byte budget: ${size} bytes`
    );
  }
}
