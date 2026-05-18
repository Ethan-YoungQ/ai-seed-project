export interface RuleKnowledgeBlock {
  id: string;
  title: string;
  text: string;
}

export const RULE_KNOWLEDGE_BLOCKS: RuleKnowledgeBlock[] = [
  {
    id: "lv2-promotion-path",
    title: "Lv2 晋升路径",
    text:
      "Lv2 AI 研究员优先看可验证的实践信号：主路径是总分达到 24 分，并且 C/S/G 至少出现有效贡献；" +
      "也可以走强实践或多维路径，例如 32 分且单维达到 8 分，或 20 分以上、两个维度 5 分以上且 C/S/G 中有一个维度达到 5 分。",
  },
  {
    id: "cs-interaction-score",
    title: "C/S 互动得分",
    text:
      "C/S 互动分来自已计入的作品互动、同伴互助、同伴反馈、点赞/引用等可审计记录；" +
      "系统回答时只引用已有 score fact 或 interaction fact，不会凭印象补写互动分。",
  },
  {
    id: "prompt-not-only-hard-condition",
    title: "Prompt 不是唯一硬条件",
    text:
      "Prompt 可以作为 K/H/C/S/G 评分证据的一部分，但不是唯一硬条件。" +
      "能被核对的作业、作品、方法分享、同伴帮助、复盘和引用原消息等，都可能构成得分证据。",
  },
];

export function getRuleKnowledgeText(question: string): string {
  const normalized = question.toLowerCase();
  const blocks = RULE_KNOWLEDGE_BLOCKS.filter((block) => {
    if (/prompt|提示词/.test(normalized)) {
      return block.id === "prompt-not-only-hard-condition" || block.id === "lv2-promotion-path";
    }
    if (/c\s*[-/]?\s*s|互动|点赞|互助/.test(normalized)) {
      return block.id === "cs-interaction-score" || block.id === "lv2-promotion-path";
    }
    return true;
  });

  return blocks.map((block) => `【${block.title}】${block.text}`).join("\n");
}
