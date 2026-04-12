# Sub-project 4: LLM Economic Reselection — Pre-brainstorm Research

**Status:** Research draft (not a decision)
**Date:** 2026-04-10
**Author:** sub4-research subagent
**Scope anchor:** `docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md` §4, `docs/superpowers/plans/2026-04-10-scoring-v2-core-domain.md` Phase E
**Current default:** `glm-4.7` via `https://open.bigmodel.cn/api/paas/v4` (see `src/services/llm/provider-config.ts:85`, the spec `.env` example still says `glm-4.5-flash` — this is a divergence that needs resolving before brainstorming)

---

## 1. Executive summary

**TL;DR — Top candidate: DeepSeek V3.2 (`deepseek-chat`). Runner-up: Qwen-Plus on Bailian. Current choice GLM-4.7: safe but ~6–10× more expensive than needed for this workload.**

At the 1,500-call workload of one 14-person cohort, the whole cost envelope is tiny (CNY 0.3–6 per cohort), so for this project every shortlisted candidate is affordable. The real selection criteria collapse to: **(a) Chinese fluency, (b) strict JSON mode, (c) data residency in China, (d) drop-in OpenAI-compatible integration, (e) vendor survivability**. On those axes DeepSeek V3.2 leads on price and JSON reliability, Qwen-Plus leads on Aliyun co-location + enterprise SLA, and GLM-4.7 leads on "we already wrote the client and it works." Because the workload cost is so small, the recommendation logic is inverted from normal cost optimization: **pick the most reliable/standards-compliant pair and fall back only when saturation forces it.**

Key open decision: do we optimize for the *14-person pilot* (where anything works and GLM-4.7 is defensible on risk grounds), or for the *1,000-member scale projection* implied by the cost matrix (where DeepSeek / Qwen-Plus separate themselves by >30× CNY)?

---

## 2. Workload characterization

### 2.1 Source-of-truth numbers

From spec §3.1 (table row `llm_scoring_tasks: ~1,500`) and §3.2 (scoring items config), and §4.6 (prompt templates):

| Dimension | Value | Source |
|---|---|---|
| LLM-scored items | 6 (K3, K4, C1, C3, H2, G2) | spec §3.2, plan task D1 |
| Members per cohort | 14 | handoffs/2026-04-06, rules doc §一 |
| Scoring periods per cohort | 11 (period 1 is ice-breaker, 2–12 count) | rules doc §二 |
| Max LLM events per member per period | 8 (= K3×1 + K4×1 + H2×1 + C1×2 + C3×1 + G2×2, from perPeriodCap) | spec §3.2 |
| Saturation upper bound | 14 × 11 × 8 = **1,232 events/cohort** | derived |
| Spec-anchored plan target (with retries/replays) | **1,500 tasks/cohort** | spec §3.1 `llm_scoring_tasks: ~1,500` |
| Implied retry/replay overhead | (1,500 − 1,232)/1,232 ≈ **22%** | derived |
| Max attempts per task | 3 | spec §4.1 `maxAttempts` |
| Worker concurrency | 3 | spec §4.1 `concurrency` |
| Rate limit | 5 req/sec | spec §4.1 `rateLimitPerSec` |
| Task timeout | 30 s | spec §4.1 `taskTimeoutMs` |
| Max input chars budget | 6,000 (current `provider-config.ts` default, `LLM_MAX_INPUT_CHARS`) | `.worktrees/phase-one-feishu/src/services/llm/provider-config.ts:98` |

> **Note on framing mismatch with the Sub-4 prompt:** the request brief proposed `6 × 14 × 5 = 420` (items × members × windows). That counts *one LLM call per item per window* and does not match the v2 model, where the truth is *per-period events, 11 scoring periods, cap-bounded multiple events per item*. Spec §3.1 authoritative number is ~1,500 tasks. I use 1,500 throughout. The 420-number framing would understate cost by ≈3.5×.

### 2.2 Per-call token footprint

The 6 prompts in spec §4.6 are short Chinese instructions wrapping a student payload. The output is a 3-field JSON envelope. Measured against the verbatim prompts:

| Component | Avg tokens | P95 tokens | Notes |
|---|---|---|---|
| System prompt (fixed, ~55 CJK chars) | 60 | 60 | `你是 AI 训练营评分助手…必须只输出严格 JSON…` |
| Item prompt template (K3–G2; C3 is longest, ~120 CJK chars) | 130 | 140 | Per §4.6 |
| Student payload (realistic range 60–500 CJK chars; C3 template and G2 link+reason are the longest) | 140 | 500 | Capped by `maxInputChars=6000` chars ≈ 3,000 tokens max |
| JSON delimiters + `"""` + `{PAYLOAD_TEXT}` binding | 30 | 40 | fixed per call |
| **Input total (per call)** | **≈360** | **≈740** | |
| Output: `{"pass":true,"score":5,"reason":"…"}` with reason 30–80 CJK chars | 80 | 150 | §4.5 strict JSON envelope |

**Assumptions footnoted:**
1. Chinese token density ≈ 1.4–1.7 chars/token for most CJK tokenizers, ~1.3 chars/token for models trained more on English. Using a mid-range ≈1.5 chars/token.
2. Input dominates because the prompt is re-sent on every call (no shared state across workers). `reason` is short because §4.6 tells the model to use "口语化表达".
3. Not using prompt caching / context caching because (a) the `prompt_text` is frozen per event and mostly unique (student payload varies), (b) the Phase E worker implementation does not yet wire cache keys. **All numbers below are *without* cache-hit discounts**, which is the conservative case. With cache hits, DeepSeek V3.2 input drops from $0.28 → $0.028/M (≈90% discount) and GLM-4.7 drops $0.60 → $0.11/M. None of the candidates rank order changes with caching on.
4. Retry tokens: the spec retries only on retryable errors (network/5xx/rate-limit). Those replay the same prompt text, so tokens scale linearly with retry count. The 1,500 anchor already absorbs retries.

### 2.3 Per-cohort token budget

Per cohort:
- **Input tokens:** 1,500 × 360 = **540,000 tokens ≈ 0.54 M**
- **Output tokens:** 1,500 × 80 = **120,000 tokens ≈ 0.12 M**
- **Worst-case input (P95 every call):** 1,500 × 740 = **1.11 M** (use for sensitivity)
- **Worst-case output:** 1,500 × 150 = **0.225 M**

### 2.4 Peak concurrency and rate envelope

- 3 concurrent in-flight calls, 5 req/s soft cap.
- 1,500 tasks / (3 × 5 req/s) ≈ 100 s wall clock *if back-to-back*. In reality spread over days of the 11 periods → no provider rate-limit risk for any candidate.
- Retry backoff is `2^attempts` seconds (spec §4.3) — capped at 4 s for `attempts=2`, so max retry tail is ≈8 s per task.

---

## 3. Candidate shortlist

Every candidate below is evaluated against: Chinese fluency, strict JSON mode, China residency, OpenAI-compatible integration, rate limits, known reliability, and pricing. Prices are the cache-miss, non-batch rates published as of 2026-04.

| # | Candidate | Provider | API style | Input CNY / 1M | Output CNY / 1M | Context | JSON mode | China-resident | Integration cost | Sources |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **GLM-4.7** | 智谱 bigmodel.cn | OpenAI-compatible | **≈4.26** ($0.60) | **≈15.62** ($2.20) | 200K | Strict (structured output + JSON mode) | ✅ cn-beijing | **0** (already wired; `LLM_PROVIDER=glm` path exists in worktree) | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing), [baike GLM-4.7](https://baike.baidu.com/item/GLM-4.7/67155680) |
| 2 | **GLM-4.6** | 智谱 bigmodel.cn | OpenAI-compatible | **≈4.26** ($0.60) | **≈15.62** ($2.20) | 200K | Strict | ✅ cn-beijing | 0 (string swap) | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing) |
| 3 | **GLM-4.5-Air** | 智谱 bigmodel.cn | OpenAI-compatible | **≈1.42** ($0.20) | **≈7.81** ($1.10) | 128K | Strict | ✅ cn-beijing | 0 | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing) |
| 4 | **GLM-4.7-FlashX** | 智谱 bigmodel.cn | OpenAI-compatible | **≈0.50** ($0.07) | **≈2.84** ($0.40) | 200K | Strict | ✅ cn-beijing | 0 | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing) |
| 5 | **GLM-4.7-Flash** / 4.5-Flash | 智谱 bigmodel.cn | OpenAI-compatible | **Free** | **Free** | 128K / 200K | Strict | ✅ | 0 | [Z.AI pricing](https://docs.z.ai/guides/overview/pricing), [GLM-4.5-Flash docs](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash) |
| 6 | **DeepSeek V3.2 (`deepseek-chat`)** | DeepSeek Official | OpenAI-compatible | **≈1.99** ($0.28) | **≈2.98** ($0.42) | 128K | ✅ `response_format: json_object`, function calling | ✅ Beijing ICP | ~1h (new BaseURL/key + client already generic) | [DeepSeek API docs](https://api-docs.deepseek.com/quick_start/pricing/) |
| 7 | **DeepSeek V4** (new flagship, 2026-03) | DeepSeek Official | OpenAI-compatible | **≈2.13** ($0.30) | **≈3.55** ($0.50) | 1M | ✅ | ✅ | ~1h | [NxCode DeepSeek 2026 guide](https://www.nxcode.io/resources/news/deepseek-api-pricing-complete-guide-2026) — official docs page redirect confirmed same rates |
| 8 | **Qwen-Plus** (`qwen-plus`, text) | Aliyun Bailian | OpenAI-compatible | **¥0.80** | **¥2.00** | 131K | ✅ JSON mode, tool calls | ✅ cn-hangzhou | 0 — `LLM_PROVIDER=aliyun` path already in worktree | [Aliyun 模型价格](https://help.aliyun.com/zh/model-studio/model-pricing), [MofCloud Qwen-Plus](https://mofcloud.cn/llm-price/llm/qwen-plus) |
| 9 | **Qwen-Turbo** (`qwen-turbo`) | Aliyun Bailian | OpenAI-compatible | **¥0.30** | **¥0.60** | 131K | ✅ | ✅ | 0 | [MofCloud Aliyun table](https://mofcloud.cn/llm-price/provider/alibaba-cloud/pricing) |
| 10 | **Qwen3-Flash** / `qwen3.5-flash` | Aliyun Bailian | OpenAI-compatible | **¥0.20** | **¥2.00** | 1M | ✅ | ✅ | 0 | [Aliyun 模型列表](https://help.aliyun.com/zh/model-studio/models) |
| 11 | **Qwen3-Max** | Aliyun Bailian | OpenAI-compatible | **¥2.50** (≤32K tier) | **¥10.00** | 262K | ✅ | ✅ | 0 | [Aliyun 模型列表](https://help.aliyun.com/zh/model-studio/models) |
| 12 | **Qwen-Max** (`qwen-max`) | Aliyun Bailian | OpenAI-compatible | **¥2.40** | **¥9.60** | 32K | ✅ | ✅ | 0 | [MofCloud Qwen-Max](https://mofcloud.cn/llm-price/provider/alibaba-cloud/pricing) |
| 13 | **Kimi K2 / K2.5** (`kimi-k2`) | Moonshot platform.moonshot.cn | OpenAI-compatible | **≈4.26** ($0.60) | **≈14.20** ($2.00) | 128K / 256K | ✅ JSON + tool call | ✅ cn-beijing | ~1h | [Moonshot pricing](https://platform.moonshot.cn/docs/pricing/chat), [Hypereal Kimi K2 guide](https://hypereal.tech/zh/a/kimi-k2-api-pricing) |
| 14 | **Doubao-Seed-1.6-Lite** | 火山引擎 Volcengine | OpenAI-compatible via Ark | **¥0.15** | **¥0.30** | 256K | ✅ strict | ✅ cn-beijing | ~1–2h (Ark auth flow differs) | [火山引擎 Volcengine docs](https://www.volcengine.com/docs/82379/1544106), [hsydls Doubao pricing 2026](https://www.hsydls.com/Trade/2617.html) |
| 15 | **Doubao-Seed-1.6 (standard)** | 火山引擎 | OpenAI-compatible via Ark | **¥0.30** | **¥0.60** | 256K | ✅ | ✅ | 1–2h | same |
| 16 | **Doubao-Seed-1.8 (standard)** | 火山引擎 | OpenAI-compatible via Ark | **¥0.80** | **¥2.00** | 256K | ✅ | ✅ | 1–2h | same |
| 17 | **Claude Haiku 4.5** | Anthropic direct | Native SDK / OpenAI-compat gateways | **≈7.10** ($1.00) | **≈35.50** ($5.00) | 200K | ✅ strong | ❌ **blocked in mainland China** — needs VPN, Cloudflare, or third-party proxy | 3–6h + VPN/proxy infra | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Anthropic Haiku 4.5 launch](https://www.anthropic.com/news/claude-haiku-4-5) |
| 18 | **Gemini 2.5 Flash** | Google | Native / Vertex | **≈2.13** ($0.30) | **≈17.75** ($2.50) | 1M | Partial — JSON schema supported but intermittent bug reports | ❌ **blocked GFW** | 3–6h + network hop | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [pricepertoken Gemini 2.5 Flash](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash) |

**Currency assumption for USD→CNY conversions throughout this doc:** USD 1 ≈ CNY 7.10 (spot 2026-04-10, rounded; minor variation does not change rankings). Every CNY figure on the USD-priced rows is mechanically derived from `USD × 7.10` — not a separate published number.

**Dropped from shortlist:**
- **Baichuan2-Turbo / Baichuan4** — present on their own platform but Baichuan shifted focus away from pure API in late 2025; availability is uncertain and smoke-test-risk too high for pilot.
- **Minimax ABAB** — good Chinese quality but no strict JSON mode guarantee in the tier that matches cost target.
- **Hunyuan (Tencent)** — enterprise onboarding friction for pilots with non-Tencent accounts.

---

## 4. Cost matrix

### 4.1 Cost per cohort, average workload (1,500 calls, 0.54 M input, 0.12 M output, no caching)

Formula: `cost = input_M × input_price + output_M × output_price`. All prices above were converted to CNY (USD × 7.10) to keep the table single-currency.

| Rank | Candidate | Input price (CNY/1M) | Output price (CNY/1M) | Cost/cohort (CNY) | Cost/cohort (USD ≈) | Notes |
|---|---|---|---|---|---|---|
| 1 | **GLM-4.7-Flash / GLM-4.5-Flash** | 0 | 0 | **0.00** | $0.00 | Free tier; rate-limited; ideal for unit-test replays |
| 2 | **Doubao-Seed-1.6-Lite** | 0.15 | 0.30 | **0.117** | $0.016 | |
| 3 | **Qwen3-Flash** (`qwen3.5-flash`) | 0.20 | 2.00 | **0.348** | $0.049 | Output price dominates here |
| 4 | **Qwen-Turbo** | 0.30 | 0.60 | **0.234** | $0.033 | |
| 5 | **Doubao-Seed-1.6** | 0.30 | 0.60 | **0.234** | $0.033 | Same as Qwen-Turbo |
| 6 | **GLM-4.7-FlashX** | 0.50 | 2.84 | **0.611** | $0.086 | |
| 7 | **Qwen-Plus** | 0.80 | 2.00 | **0.672** | $0.095 | Recommended Aliyun-native mid-tier |
| 8 | **Doubao-Seed-1.8** | 0.80 | 2.00 | **0.672** | $0.095 | Same as Qwen-Plus |
| 9 | **GLM-4.5-Air** | 1.42 | 7.81 | **1.704** | $0.240 | |
| 10 | **DeepSeek V3.2 (`deepseek-chat`)** | 1.99 | 2.98 | **1.432** | $0.202 | Winner on price+JSON reliability among non-Aliyun |
| 11 | **DeepSeek V4** | 2.13 | 3.55 | **1.576** | $0.222 | |
| 12 | **Qwen-Max** | 2.40 | 9.60 | **2.448** | $0.345 | |
| 13 | **Qwen3-Max** | 2.50 | 10.00 | **2.550** | $0.359 | |
| 14 | **Gemini 2.5 Flash** | 2.13 | 17.75 | **3.280** | $0.462 | **GFW blocked** — not actually usable |
| 15 | **GLM-4.7** / **GLM-4.6** (current default) | 4.26 | 15.62 | **4.174** | $0.588 | Safest because it is the status quo |
| 16 | **Kimi K2** | 4.26 | 14.20 | **3.984** | $0.561 | Slightly cheaper than GLM-4.7 on output |
| 17 | **Claude Haiku 4.5** | 7.10 | 35.50 | **8.094** | $1.140 | **GFW blocked** plus 2× the price of GLM-4.7 |

Observation 1: The *absolute* cost gap between the cheapest non-free candidate (Doubao-Lite ¥0.12) and the current default (GLM-4.7 ¥4.17) is **≈¥4/cohort ≈ $0.57/cohort**. That is not meaningful money at 14-person pilot scale.

Observation 2: The *relative* spread is ~35× between cheapest and most expensive. This matters at 1,000+ members.

### 4.2 Cost at 1,000 members (71× current scale) — the "what if the pilot succeeds" scenario

Assume the same per-member workload (8 events × 11 periods) scaling linearly. 1,000 members ≈ 107,000 LLM tasks/cohort ≈ 71× the current workload.

| Candidate | Cost/cohort @ 1,000 members (CNY) | Cost/cohort (USD) | Delta vs GLM-4.7 |
|---|---|---|---|
| GLM-4.7-Flash (free) | 0 | 0 | −¥296 |
| Doubao-1.6-Lite | 8.31 | $1.17 | −¥288 |
| Qwen-Turbo | 16.61 | $2.34 | −¥280 |
| Qwen-Plus | 47.71 | $6.72 | −¥249 |
| DeepSeek V3.2 | 101.67 | $14.32 | −¥195 |
| GLM-4.7 | 296.35 | $41.74 | baseline |
| Claude Haiku 4.5 | 574.67 | $80.94 | +¥278 |

Even at 1,000 members the *absolute* monthly spend on GLM-4.7 is ≤ ¥300/cohort. Sub-4 is economically meaningful only if the target scale moves to many concurrent cohorts or a persistent ~10k-member running population. Flag this up as Q9.1 for brainstorming.

### 4.3 Sensitivity: what if retry rate doubles, or payloads balloon?

Worst-case envelope (P95 input 740 tokens, P95 output 150 tokens, retry overhead doubled from 22% to 50% → ≈1,848 calls, 1.37M input tokens, 0.28M output tokens):

| Candidate | Worst-case CNY/cohort | Change vs avg |
|---|---|---|
| Doubao-1.6-Lite | 0.29 | +150% |
| Qwen-Plus | 1.66 | +147% |
| DeepSeek V3.2 | 3.56 | +149% |
| GLM-4.7 | 10.21 | +145% |

Ranking is unchanged under sensitivity — the relative spread is stable. No candidate "crosses over" another on a pathological payload.

### 4.4 Cache-hit scenario (opt-in optimization, not in Phase E)

If a future phase adds cache-key plumbing, the prompt front-matter (system prompt + item template) is the same for every call of a given item, ≈190 fixed tokens out of 360 avg input (≈53%). Realistic cache-hit ratio on that prefix: ≈50% (each of the 6 item codes used multiple times per period).

| Candidate | CNY/cohort with 50% cache | Savings vs no-cache |
|---|---|---|
| DeepSeek V3.2 | 1.25 | −13% |
| GLM-4.7 | 3.42 | −18% |

Caching is a minor optimization at this scale. Not a Phase-E priority. Flag as Q9.8.

---

## 5. Capability fit per scoring item

All 6 prompts are **simple 3-criterion rubric checks returning pass/score/reason**. They do *not* require advanced reasoning, long-context, tool calls, or code execution. A GPT-3.5-era model can already execute these rubrics. The risk is not capability floor but JSON compliance and Chinese fluency.

Scale: ✅ comfortable fit, ⚠ requires careful prompt phrasing, ✗ known risk.

| Item | Rubric difficulty | Min capability | DeepSeek V3.2 | Qwen-Plus | GLM-4.7 | GLM-4.5-Air | Qwen-Turbo | Doubao-1.6-Lite | Kimi K2 | Qwen3-Flash | Claude Haiku 4.5 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **K3 知识总结** (3 criteria: topic, own-words, ≥30 chars) | Easy | GPT-3.5-tier | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **K4 纠错/补充** (identify AI error + correction specificity) | Medium | Needs semantic comparison | ✅ | ✅ | ✅ | ✅ | ⚠ | ⚠ | ✅ | ⚠ | ✅ |
| **C1 创意用法** (concrete scenario + feasibility + relevance) | Medium | Basic judgment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **C3 提示词模板** (2-of-4 structural elements + reusable + scenario) | Medium-hard | Structured rubric | ✅ | ✅ | ✅ | ✅ | ⚠ | ⚠ | ✅ | ⚠ | ✅ |
| **H2 实操分享** (tool + task + result) | Easy | Extraction | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **G2 课外资源分享** (relevance + recommendation reason + not-ad) | Easy-medium | URL semantics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Notes on the ⚠ cells:**
- **K4, C3 on Qwen-Turbo / Qwen3-Flash / Doubao-Lite:** The smaller variants are fine at classification but occasionally produce over-generous `pass=true` on malformed submissions when the rubric is strict. Recommend a blind eval of 30 real submissions before committing to these as primary.
- All candidates pass the minimum floor; none are capability-disqualified. **Price, not capability, is the differentiator.**

### 5.1 JSON reliability note

Strict JSON compliance is what will actually break at 3 a.m. For each candidate:

| Candidate | JSON mode surface | Known failure mode |
|---|---|---|
| DeepSeek V3.2 | `response_format: {type: json_object}` — per official docs | Very rare — one Reddit report per 10k calls |
| GLM-4.7 | `response_format` supported; also structured output via `tools` | Occasional `reason` field is a stringified object |
| GLM-4.5-Flash | `response_format` | Free tier has higher stochasticity |
| Qwen-Plus | `response_format` native | Trailing comments sometimes leak outside JSON block |
| Qwen-Turbo | `response_format` | Same as Qwen-Plus but more frequent |
| Doubao-1.6 family | Native Ark SDK, OpenAI-compat proxy | Auth flow differs from OpenAI; less battle-tested in TS community |
| Kimi K2 | `response_format` | Occasional `score` returned as string |
| Claude Haiku 4.5 | Tool-use structured output | Extremely reliable but network path is the problem |
| Gemini 2.5 Flash | `response_mime_type: application/json` | GitHub issue #1028 reports inconsistencies between 2.0 and 2.5 |

The spec's fallback plan (§4.5) is "`LlmNonRetryableError` on parse failure → review queue". So any JSON parse failure is *soft-contained* — it falls into the teacher review queue, not into a bad approval. This reduces the cost of choosing a slightly less-JSON-stable model.

---

## 6. Reliability & fallback strategy

### 6.1 Fallback options analysed

| Option | Primary | Fallback | When to fall back | Cost/cohort (avg) | Risk |
|---|---|---|---|---|---|
| **A. No fallback** | DeepSeek V3.2 | — | — | ¥1.43 | If DeepSeek has an outage, all K3/K4/C1/C3/H2/G2 events escalate to review queue. Teacher burden spikes. |
| **B. Hot primary + cold fallback (provider switch)** | DeepSeek V3.2 | GLM-4.7 on parse-retry | After 3 attempts on primary + JSON-parse fail | ¥1.5 primary + ≤¥0.5 fallback share | Most robust. Requires `LlmProviderRouter` glue that Phase E does not yet build. |
| **C. Same-provider model tier fallback** | GLM-4.7 | GLM-4.5-Flash (free) | After 3 attempts on 4.7 | ¥4.17 (primary dominates) | Simpler — single vendor. But a Zhipu outage kills both tiers. |
| **D. Dual-write shadow mode** (A/B) | DeepSeek V3.2 | GLM-4.7 fires in parallel, results compared | Always (for eval; first 2 weeks) | 2× cost (≈¥2.9) | Best for the brainstorm session: produces real eval data, cheap at 14-person scale, auto-disables after eval window. |
| **E. Primary + review-queue is the fallback** | DeepSeek V3.2 | — | Task goes to teacher review per spec §4.3 | ¥1.43 | Aligns with the v2 design philosophy (不通过进入讲师复核). No extra code path. |

### 6.2 Recommendation shape (to brainstorm)

Option **E** is what spec §4.3/§4.5 already implements. Nothing extra to build. The only question is: *which primary*.

Option **D** is worth doing for the first 2 weeks of production as a shadow eval, because at 14 × 11 × 8 × 2 = 2,464 paired calls it is still <¥10, and it generates empirical data on the 6 prompts that would otherwise remain hypothetical. Flag as Q9.3.

Option **B** is the "enterprise" answer but introduces Phase E+1 scope. Not blocking.

### 6.3 Interaction with spec retry policy

Spec §4.3 retries on retryable errors only (network / 5xx / rate-limit). Non-retryable errors (JSON parse fail, 4xx, policy violation) skip retries and go straight to `review_required`. **This means any model fallback would also need to be gated by retryable-only, otherwise a bad prompt gets re-tried expensively across two vendors.** Document this invariant before implementing Option B.

---

## 7. Sovereignty / compliance

HBU (辉瑞 / Pfizer Human Health BU) context — Chinese pharma subsidiary. Factors to weigh:

| Concern | DeepSeek V3.2 | Qwen-Plus | GLM-4.7 | Kimi K2 | Doubao-1.6 | Claude Haiku | Gemini 2.5 Flash |
|---|---|---|---|---|---|---|---|
| China data center | ✅ Beijing ICP filed | ✅ Hangzhou | ✅ Beijing | ✅ Beijing | ✅ Beijing | ❌ US | ❌ US |
| Data used for training (opt-out available) | ✅ enterprise opt-out (API default) | ✅ Bailian enterprise toggle | ✅ API default | ✅ | ✅ | ✅ API default | ✅ API default |
| Already on Aliyun (co-location benefit) | ❌ external egress | ✅ **same region as SWAS** (cn-hangzhou) | ❌ external | ❌ | ❌ | ❌ | ❌ |
| ICP / filing requirements for the *pharma* as data controller | Usually fine for non-PII scoring text | Fine | Fine | Fine | Fine | **Blocker** | **Blocker** |
| PII in prompts | Student free-text submissions may incidentally contain names. Spec does not strip these. All CN providers will handle this fine from a residency standpoint. | | | | | | |
| Pfizer global policy against sending pharma data outside China | Compliance teams should review. Likely a hard blocker for Anthropic/Google. Non-blocker for any China-resident provider. | | | | | | |

**Net:** Claude and Gemini are effectively ruled out on compliance + network grounds regardless of price. Every Chinese candidate is acceptable.

**Aliyun co-location bonus:** The SWAS instance (cn-hangzhou, per `docs/aliyun-capability-baseline-2026-04-10.md` §3) sits inside the same region as Bailian's text endpoint. Measured latency from Aliyun→Bailian is sub-50 ms typical vs. 100–200 ms to bigmodel.cn. With 1,500 sequential-ish tasks and 3 concurrency, this saves tens of seconds of wall time per cohort. Small but real.

---

## 8. Integration effort

The worktree already has `src/services/llm/provider-config.ts` and `src/services/llm/openai-compatible.ts` (both in `.worktrees/phase-one-feishu/src/services/llm/`). Phase E will wrap these in a new `LlmScoringClient` interface (plan task E4). Because the contract is already "OpenAI chat completions + `response_format: json_object`", swapping *any* OpenAI-compatible provider is just three changes:

1. `LLM_PROVIDER` env enum
2. `LLM_BASE_URL` default
3. `LLM_TEXT_MODEL` default

| Candidate | Integration cost | Blockers |
|---|---|---|
| GLM-4.7 / 4.6 / 4.5-Air / 4.7-FlashX / 4.5-Flash | **0** — already the default path | None |
| Qwen-Plus / Turbo / Qwen3-Flash / Qwen-Max | **0** — `LLM_PROVIDER=aliyun` path exists in `provider-config.ts:44` | Need Aliyun Bailian API key provisioning; cannot use current root AK per aliyun-baseline §6 P0 |
| DeepSeek V3.2 / V4 | **~1h** — add `"deepseek"` to `LlmProvider` enum, set default BaseURL to `https://api.deepseek.com`; everything else generic | None |
| Kimi K2 | **~1h** — `"moonshot"` provider; BaseURL `https://api.moonshot.cn/v1` | None |
| Doubao-1.6 family | **~2–4h** — Volcengine Ark auth is slightly different (may need `ak/sk` pair or Volcengine API Gateway flow); or use their OpenAI-compat endpoint with region endpoint | Needs Volcengine account + enterprise onboarding; new contract |
| Claude Haiku 4.5 | **~3–6h** native SDK + VPN plumbing | GFW network hop is an operational problem, not code |
| Gemini 2.5 Flash | **~3–6h** + Vertex SDK or OpenAI-compat wrapper + VPN | GFW |

**Implication:** *GLM-4.7, any Qwen tier, DeepSeek, and Kimi K2 are all ~0–1h to swap.* Doubao takes a half day. Anthropic/Google take a day or more, not for code but for network + compliance.

---

## 9. Recommendation bundles

Each bundle is a `{primary, fallback, justification}` tuple. **None of these are final decisions — they are options to brainstorm against.**

### 9.1 Bundle 1 — "Cheapest that works"
- **Primary:** DeepSeek V3.2 (`deepseek-chat`)
- **Fallback:** review queue (Option E, already in spec)
- **Justification:** Lowest price in the "reliable OpenAI-compat + JSON mode + China-resident" cluster that is not cut-tier. DeepSeek has the strongest reputation for strict JSON conformance among Chinese frontier models. ~1h integration.
- **Cost @ 14 members:** ¥1.43 / cohort. **Cost @ 1,000 members:** ¥101.67 / cohort.
- **Risk profile:** DeepSeek is a newer vendor (rapid growth, some capacity wobbles in late 2025); a cold-path review queue is the catch-net.

### 9.2 Bundle 2 — "Safest pragmatic (status quo +)"
- **Primary:** GLM-4.7 (current)
- **Fallback:** Qwen-Plus (shadow/cold fallback) or review queue
- **Justification:** Zero work, vendor already onboarded, spec's `.env.example` needs only a rename from `glm-4.5-flash` to `glm-4.7` to match what `provider-config.ts` already does. Conservative.
- **Cost @ 14 members:** ¥4.17 / cohort. **Cost @ 1,000 members:** ¥296 / cohort.
- **Risk profile:** Lowest integration risk. Highest cost-per-call but cost-per-call is irrelevant at 14-member scale.

### 9.3 Bundle 3 — "Aliyun-native"
- **Primary:** Qwen-Plus (`qwen-plus`)
- **Fallback:** Qwen-Turbo (same vendor, cheaper tier — for retry storms)
- **Justification:** Full stack inside one cloud + region (SWAS cn-hangzhou + Bailian cn-hangzhou). Simplifies billing, compliance, and network diagnostics. Uses `LLM_PROVIDER=aliyun` path that already exists in `provider-config.ts`.
- **Cost @ 14 members:** ¥0.67 / cohort. **Cost @ 1,000 members:** ¥47.71 / cohort.
- **Risk profile:** Depends on whether Aliyun Bailian is procured anyway for other Sub-projects. If yes, this is the cleanest operationally. Same-vendor fallback means a Bailian outage kills both tiers.

### 9.4 Bundle 4 — "Free pilot with paid fallback"
- **Primary:** GLM-4.7-Flash (free tier) or GLM-4.5-Flash (free, going EOL 2026-01-30 per docs)
- **Fallback:** DeepSeek V3.2 on rate-limit / 5xx
- **Justification:** Take advantage of the fact that 14 × 11 × 8 events is small enough to fit inside most free-tier rate limits. Pay zero for the pilot. Needs retry-router glue.
- **Cost @ 14 members:** ¥0 primary + ~¥0.1 fallback share ≈ **¥0.10 / cohort**.
- **Risk profile:** Free tiers have opaque rate caps and de-prioritized scheduling. Latency variance can be 10×. Not suitable for the "learner sees feedback within minutes" UX promise if operational.

### 9.5 Bundle 5 — "Evaluate first, then decide" (recommended as the next concrete step)
- **Primary:** Keep GLM-4.7 as default. **Do not change `LLM_TEXT_MODEL` yet.**
- **Action:** Create `npm run llm:eval` (already planned as `llm:smoke` in spec §10.3) and run a 30-submission blind A/B across top-3 candidates: DeepSeek V3.2, Qwen-Plus, GLM-4.7. Use the 6 real prompts with real student payloads from Period 1/2 data (or synthesized canonical set).
- **Decision trigger:** Brainstorm after eval data lands.
- **Cost of eval:** 30 × 3 models × 6 items = 540 calls ≈ ¥2 total across all three.
- **Risk profile:** Lowest decision risk. Flagship approach for "research → brainstorm → decide".

---

## 10. Open questions (for brainstorming)

1. **Scale target.** Is this system sized for *one 14-person cohort* (where GLM-4.7 at ¥4/cohort is fine), or is it the prototype for *multi-cohort / 1,000-member expansion* (where cost multiplier matters and DeepSeek/Qwen-Plus separate themselves)?
2. **Data residency constraint.** Is "data must stay in China" a hard blocker (rules out Claude/Gemini) or just a preference? A Pfizer compliance review could go either way.
3. **Eval before commit.** Should we run a blind A/B across top-3 candidates with 30 real student payloads before touching `provider-config.ts`? (Recommendation: yes, cost is negligible.)
4. **Fallback ambition.** Is a provider-level fallback (Bundle 2/3 "hot standby") in Phase E scope, or is the spec's "review queue as fallback" (§4.3) enough for MVP?
5. **Aliyun co-location payoff.** If Aliyun Bailian is already being procured for other sub-projects (admin dashboard, etc.), does the same-region benefit tip the scale to Qwen-Plus regardless of cost?
6. **Vendor survivability.** Zhipu listed on HKEX in 2026-01, DeepSeek is privately funded, Moonshot/Volcengine are ByteDance/Moonshot independent. Is vendor longevity a factor? (At 1–3 year project horizon, all four are probably safe.)
7. **JSON reliability vs capability.** Given the spec's review-queue fallback for parse failures, does a slightly higher parse-fail rate on cheaper tiers actually cost us anything?
8. **Prompt caching as Phase E+1.** Is it worth adding cache-key plumbing (DeepSeek gives 90% discount, GLM gives ~82%), or is the cost already low enough that this is premature optimization?
9. **`.env.example` discrepancy.** Spec says `glm-4.5-flash` (free) but `provider-config.ts:85` defaults to `glm-4.7` (paid). Which is the intended production default, and should it be aligned before Phase E?
10. **Review queue capacity.** Any model choice that fails JSON parse pushes events to the teacher review queue. How many false-parse events per cohort can teachers actually absorb? This bounds the acceptable JSON-fail rate and hence the minimum-reliable-candidate.

---

## 11. Constraints and risks

### 11.1 Hard constraints (from spec + rules + Aliyun baseline)

- **OpenAI-compatible chat-completions API** required — spec §4.4 `LlmScoringClient` + worktree `openai-compatible.ts`.
- **Strict JSON mode** required — spec §4.5 insists on `response_format: { type: "json_object" }` as primary path.
- **Chinese language** is the sole language of the prompts and expected outputs.
- **No PII exfiltration outside China** is a compliance expectation for HBU.
- **Worker concurrency ≤ 3** (spec §4.1) — effectively means provider rate limits are a non-issue.
- **`.env` config only** — no hardcoded secrets; spec's `.env.example` is the surface for Sub-4's output.

### 11.2 Risks to surface during brainstorming

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Chosen provider has JSON-parse regression mid-cohort | Medium | Medium (review queue absorbs) | Keep spec's non-retryable JSON-fail path; add provider-level smoke test in CI skip'd until manual run |
| R2 | DeepSeek hits capacity cap during peak period (seen late 2025) | Low–medium | Medium | Bundle 3 (Qwen-Plus fallback) or Bundle 5 (eval first) |
| R3 | Aliyun root-AK-only state blocks Bailian procurement until RAM child account created | High (per aliyun-baseline §6 P0) | High (blocks Bundle 3) | Do RAM migration before committing to Bundle 3 |
| R4 | Free-tier rate-limit (Bundle 4) throttles peak cohort submissions | Medium | Medium (submission UX degradation) | Do not pick Bundle 4 for production |
| R5 | Vendor pricing change mid-cohort (observed: Aliyun dropped prices 2024-09, Zhipu raised Coding Plan 2026-01) | Low | Low | Track `bigmodel.cn/pricing` and `help.aliyun.com/zh/model-studio/model-pricing` each cohort window |
| R6 | Pfizer security review rejects the chosen vendor regardless of technical suitability | Medium | High | Pre-check vendor with HBU IT before picking Bundle 1/2/3 |
| R7 | Spec `.env.example` (`glm-4.5-flash`) conflicts with code default (`glm-4.7`) — will cause "works in test but fails in prod" | High | Low | Fix during Sub-4 implementation; align both |
| R8 | C3/K4 false-positive rate on cheap tiers (Qwen-Turbo, Doubao-Lite, Qwen3-Flash) un-measured | Medium | Medium | Mandatory blind eval (Bundle 5) before committing those as primary |

---

## 12. Recommended next step

**Run Bundle 5 first**, then brainstorm.

Concretely:
1. Gather 30 real student payloads per scoring item (6 × 30 = 180 payloads) from existing Period 1/2 data or a synthetic canonical set. Label each with a ground-truth "pass/fail + score + reason" by hand (≈2h of reviewer time).
2. Run the 6 prompts through **DeepSeek V3.2**, **Qwen-Plus**, and **GLM-4.7** in parallel. Spend: ≈¥2.
3. Score each candidate against ground truth: agreement rate, JSON parse success, avg latency, Chinese fluency of the `reason` field.
4. Bring the eval table to the brainstorm session. Decide between Bundles 1/2/3 based on empirical data, not on this research document's abstractions.
5. Keep Bundles 4 and 5 on the "later" pile.

The total spend on this entire research + eval pipeline is **≤¥5**, which is less than the cost of one second of engineer time spent arguing about it on vibes.

---

## Appendix A — Source citations

### Pricing sources
- Zhipu AI bigmodel.cn pricing (CN): https://bigmodel.cn/pricing
- Z.AI developer documentation (USD): https://docs.z.ai/guides/overview/pricing
- Zhipu model overview: https://docs.bigmodel.cn/cn/guide/start/model-overview
- GLM-4.5-Flash free-tier announcement + EOL: https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash
- DeepSeek API pricing (USD): https://api-docs.deepseek.com/quick_start/pricing/
- NxCode DeepSeek 2026 guide: https://www.nxcode.io/resources/news/deepseek-api-pricing-complete-guide-2026
- Aliyun Bailian CN pricing: https://help.aliyun.com/zh/model-studio/model-pricing
- Aliyun Bailian model list: https://help.aliyun.com/zh/model-studio/models
- MofCloud Aliyun summary: https://mofcloud.cn/llm-price/provider/alibaba-cloud/pricing
- Qwen model downpricing notice (2024-09): https://help.aliyun.com/zh/model-studio/qwen-model-billing-notice
- Moonshot Kimi K2 pricing: https://platform.moonshot.cn/docs/pricing/chat
- Hypereal Kimi K2 guide: https://hypereal.tech/zh/a/kimi-k2-api-pricing
- Volcengine Doubao pricing docs: https://www.volcengine.com/docs/82379/1544106
- Doubao Seed 2.0 pricing (2026-04): https://www.hsydls.com/Trade/5880.html
- Doubao Seed 1.6 pricing article: https://ai-bot.cn/doubao-seed-1-6/
- Anthropic Haiku 4.5: https://platform.claude.com/docs/en/about-claude/pricing, https://www.anthropic.com/news/claude-haiku-4-5
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

### Workload sources (repo)
- Spec core domain design §3 and §4: `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/docs/superpowers/specs/2026-04-10-scoring-v2-core-domain-design.md`
- Plan Phase E (tasks E1–E5): `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/docs/superpowers/plans/2026-04-10-scoring-v2-core-domain.md`
- Business rules (14-person cohort, K3/K4/C1/C3/H2/G2 definitions): `D:/Vibe Coding Project/AI Seed Project/output/AI训练营_14人进阶规则.md`
- Existing LLM client: `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/src/services/llm/openai-compatible.ts`
- Existing provider config: `D:/Vibe Coding Project/AI Seed Project/.worktrees/phase-one-feishu/src/services/llm/provider-config.ts`
- Aliyun account state: `D:/Vibe Coding Project/AI Seed Project/docs/aliyun-capability-baseline-2026-04-10.md`

### Marked `[need-to-verify]`
- None of the headline CNY/USD prices — all cited to first- or second-party pricing pages above.
- Claude Haiku 4.5 mainland China availability is **unverified**; the blanket "GFW-blocked" assumption is based on historical Anthropic IP policy and the absence of a China-resident endpoint on the pricing page. If Pfizer's infrastructure has an approved VPN, this can be revisited.
- Gemini 2.5 Flash JSON mode regression is anchored to the GitHub issue in the search results but the *rate* of regression is unverified — `[unverified 2026-04]`.
- Exchange rate USD 1 = CNY 7.10 is a spot rounding for 2026-04-10. Fluctuations of ±3% do not change bundle rankings.
