import type { ScoringDecision } from "../../../domain/v3/scoring-decision.js";
import { parseScoringDecision } from "../../../domain/v3/scoring-decision.js";
import {
  AI_BOOT_RULESET_VERSION,
  CATEGORY_SCORE_RANGES,
} from "../../../domain/v3/scoring-rules.js";
import type { EvidenceBundle } from "./content-extractor.js";

export const AI_BOOT_PROMPT_VERSION = "2026-05-16-v1";

export interface AiBootLlmClient {
  provider: string;
  model: string;
  chat(
    messages: Array<{ role: "system" | "user"; content: string }>,
    options: { timeoutMs: number; temperature?: number; maxTokens?: number },
  ): Promise<string>;
}

export function buildScoringPrompt(input: {
  evidence: EvidenceBundle;
  memberName: string;
}): string {
  const { evidence, memberName } = input;

  return `AI_BOOT_PROMPT_VERSION: ${AI_BOOT_PROMPT_VERSION}
AI_BOOT_RULESET_VERSION: ${AI_BOOT_RULESET_VERSION}

你是「辉瑞 HBU AI 训练营」积分审核助手。请根据证据判断是否给学员加分。

评分意图：
- 鼓励有用的 AI 学习、实践、作品产出和群内贡献。
- 不把「分享 prompt」当成合规要求；不要为了索要 prompt 而压低 AI 图片、AI 产物、工作流结果或实践复盘的分数。
- English contract: prompt is not required except prompt_or_method.
- 中文规则：prompt 不是必需项，除非分类为 prompt_or_method。
- AI image、AI artifact、workflow result、practice reflection 只要证据清楚，可以在未分享 prompt 时得分。

分类与分值范围（必须严格遵守）：
- daily_participation: ${CATEGORY_SCORE_RANGES.daily_participation.min}
  日常有效参与，只有基础参与分。
- ai_artifact: ${CATEGORY_SCORE_RANGES.ai_artifact.min}-${CATEGORY_SCORE_RANGES.ai_artifact.max}
  提交 AI 生成或 AI 辅助完成的图片、海报、文档、表格、应用、流程产物等，证据能看出具体产出即可。
- ai_practice_reflection: ${CATEGORY_SCORE_RANGES.ai_practice_reflection.min}-${CATEGORY_SCORE_RANGES.ai_practice_reflection.max}
  复盘 AI 使用过程、效果、局限、改进点或业务应用收获。
- prompt_or_method: ${CATEGORY_SCORE_RANGES.prompt_or_method.min}-${CATEGORY_SCORE_RANGES.prompt_or_method.max}
  分享可复用的 prompt、方法步骤、工作流、参数、验证方式或操作策略；此分类需要明确的方法或 prompt 证据。
- resource_recommendation: ${CATEGORY_SCORE_RANGES.resource_recommendation.min}-${CATEGORY_SCORE_RANGES.resource_recommendation.max}
  推荐 AI 学习资源、工具、文章、课程或案例，并说明推荐理由或使用场景。
- peer_help: ${CATEGORY_SCORE_RANGES.peer_help.min}-${CATEGORY_SCORE_RANGES.peer_help.max}
  回答同学问题、排查问题、补充资料、给出可执行建议或协助他人完成 AI 实践。
- formal_task: ${CATEGORY_SCORE_RANGES.formal_task.min}-${CATEGORY_SCORE_RANGES.formal_task.max}
  正式作业、测验、课程任务或运营指定任务，按完成度和证据质量评分。
- operator_adjustment: ${CATEGORY_SCORE_RANGES.operator_adjustment.min}..${CATEGORY_SCORE_RANGES.operator_adjustment.max}
  人工运营调整，自动评分通常不要选择。

no-score boundaries（命中时通常输出 status=no_score 或 review_required）：
- pure thanks/OK/emoji：纯感谢、OK、收到、表情等寒暄。
- pure link without reason：只有链接且没有推荐理由、摘要或使用场景。
- bot/admin chat：与机器人、管理员、讲师的运营或答疑对话，不是学员贡献。
- duplicates：重复提交、重复刷分、已加分内容再次提交。
- vague claims without evidence：只说「我做了」「很好用」但没有产物、过程、链接、截图、文件或具体说明。
- operational/meta chat：签到统计、规则讨论、催交、技术通知、群管理等元信息。

输出要求：
- JSON-only。只输出一个 JSON 对象。
- No markdown around output. 不要代码块、不要解释、不要前后缀。
- 字段必须 exactly compatible with ScoringDecision：
  status: "approved" | "review_required" | "rejected" | "no_score" | "shadow"
  category: "daily_participation" | "ai_artifact" | "ai_practice_reflection" | "prompt_or_method" | "resource_recommendation" | "peer_help" | "formal_task" | "operator_adjustment"
  scoreDelta: number
  confidence: "high" | "medium" | "low"
  notifyPolicy: "silent" | "personal_reply" | "group_praise" | "daily_digest"
  reason: string
  evidence: string
  badges: string[]
- reason 和 evidence 必须简洁、可审计，说明为什么选该分类和分值；不要空泛夸奖。
- no_score/rejected 的 scoreDelta 应为 0，notifyPolicy 应为 silent。

待评分学员：${memberName}

证据：
${JSON.stringify(evidence, null, 2)}
`;
}

export async function decideWithLlm(
  client: AiBootLlmClient,
  input: { evidence: EvidenceBundle; memberName: string },
): Promise<ScoringDecision> {
  const response = await client.chat(
    [
      {
        role: "system",
        content:
          "You are an audit-grade AI Boot scoring judge. Return only JSON compatible with ScoringDecision.",
      },
      {
        role: "user",
        content: buildScoringPrompt(input),
      },
    ],
    {
      timeoutMs: 15000,
      temperature: 0.1,
      maxTokens: 600,
    },
  );

  return parseScoringDecision(JSON.parse(response));
}
