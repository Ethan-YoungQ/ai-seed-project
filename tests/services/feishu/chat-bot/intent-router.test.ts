import { describe, expect, it } from "vitest";
import {
  classifyBotQuestionIntent,
  type BotQuestionIntentKind,
} from "../../../../src/services/feishu/chat-bot/intent-router";

describe("classifyBotQuestionIntent", () => {
  const cases: Array<{ text: string; kind: BotQuestionIntentKind }> = [
    { text: "为什么我还是潜力股[泣不成声]", kind: "level_status" },
    { text: "如何能成为潜力股", kind: "level_status" },
    { text: "我的 C/S 点赞互动算了吗", kind: "cs_interaction_check" },
    { text: "我给同学点赞有分吗", kind: "cs_interaction_check" },
    { text: "我刚才那条海报是不是漏分了", kind: "score_missing_check" },
    { text: "天梯榜规则是什么，prompt 必须发吗", kind: "rules_query" },
    { text: "结合上文解释一下 RAG", kind: "course_or_homework_qa" },
    { text: "今天午饭吃什么呀", kind: "general_chat" },
  ];

  it.each(cases)("classifies $text as $kind", ({ text, kind }) => {
    expect(classifyBotQuestionIntent(text)).toEqual({ kind });
  });

  it("treats blank text as general chat", () => {
    expect(classifyBotQuestionIntent("   \n\t")).toEqual({ kind: "general_chat" });
  });
});
