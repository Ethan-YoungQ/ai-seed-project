import { describe, expect, it } from "vitest";
import {
  classifyBotQuestionIntent,
  type BotQuestionIntentKind,
} from "../../../../src/services/feishu/chat-bot/intent-router";

describe("classifyBotQuestionIntent", () => {
  const cases: Array<{ text: string; kind: BotQuestionIntentKind }> = [
    { text: "为什么我还是潜力股[泣不成声]", kind: "level_status" },
    { text: "Grace 为什么我还是潜力股", kind: "level_status" },
    { text: "如何能成为潜力股", kind: "level_status" },
    { text: "我的段位是多少", kind: "level_status" },
    { text: "当前段位是什么", kind: "level_status" },
    { text: "Grace 现在什么段位", kind: "level_status" },
    { text: "C-S 点赞算吗", kind: "cs_interaction_check" },
    { text: "CS互动没算", kind: "cs_interaction_check" },
    { text: "我的 C/S 点赞互动算了吗", kind: "cs_interaction_check" },
    { text: "我给同学点赞有分吗", kind: "cs_interaction_check" },
    { text: "互助没算分吗", kind: "cs_interaction_check" },
    { text: "我刚才那条海报是不是漏分了", kind: "score_missing_check" },
    { text: "天梯榜规则是什么，prompt 必须发吗", kind: "rules_query" },
    { text: "天梯榜规则是什么", kind: "rules_query" },
    { text: "prompt 必须发吗", kind: "rules_query" },
    { text: "得分攻略在哪里", kind: "rules_query" },
    { text: "张本一多少分", kind: "score_breakdown" },
    { text: "张本一排名第几", kind: "score_breakdown" },
    { text: "张本一在天梯榜第几", kind: "score_breakdown" },
    { text: "我现在多少分", kind: "score_breakdown" },
    { text: "我的总分是多少", kind: "score_breakdown" },
    { text: "我排行榜第几", kind: "score_breakdown" },
    { text: "我的维度分是多少", kind: "score_breakdown" },
    { text: "帮我看这份作业能得几分", kind: "course_or_homework_qa" },
    { text: "这份作业能得多少分", kind: "course_or_homework_qa" },
    { text: "结合我交的作业看能得几分", kind: "course_or_homework_qa" },
    { text: "结合上文解释一下 RAG", kind: "course_or_homework_qa" },
    { text: "解释一下 C/S 架构", kind: "course_or_homework_qa" },
    { text: "这段互动案例怎么理解", kind: "course_or_homework_qa" },
    { text: "这条评论是什么意思", kind: "general_chat" },
    { text: "今天午饭吃什么呀", kind: "general_chat" },
  ];

  it.each(cases)("classifies $text as $kind", ({ text, kind }) => {
    const intent = classifyBotQuestionIntent(text);
    expect(intent).toMatchObject({ kind });
    expect(intent.reason).toEqual(expect.any(String));
    expect(intent.reason.length).toBeGreaterThan(0);
  });

  it("treats blank text as general chat", () => {
    expect(classifyBotQuestionIntent("   \n\t")).toEqual({
      kind: "general_chat",
      reason: "fallback",
    });
  });

  it("returns a stable reason for level keyword matches", () => {
    expect(classifyBotQuestionIntent("Grace 为什么我还是潜力股")).toEqual({
      kind: "level_status",
      reason: "level_keywords",
    });
  });
});
