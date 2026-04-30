import { describe, expect, it } from "vitest";
import { classifyMessage } from "../../../src/services/feishu/message-classifier";
import type { NormalizedFeishuMessage } from "../../../src/services/feishu/normalize-message";

function makeMsg(overrides: Partial<NormalizedFeishuMessage> = {}): NormalizedFeishuMessage {
  return {
    messageId: "msg-001",
    memberId: "user-001",
    chatId: "chat-001",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: "1775210400000",
    rawText: "",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable" as const,
    eventUrl: "",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

function itemCodes(results: ReturnType<typeof classifyMessage>): string[] {
  return results.map((r) => r.itemCode);
}

describe("classifyMessage", () => {
  // ==========================================================================
  // C2: Reaction
  // ==========================================================================
  it("C2: detects reaction synthetic messages", () => {
    const results = classifyMessage(makeMsg({ rawText: "[表情回应: thumbsup]" }));
    expect(itemCodes(results)).toContain("C2");
    expect(results.find((r) => r.itemCode === "C2")!.confidence).toBe("rule");
  });

  it("C2: reaction still includes K1 check-in", () => {
    const results = classifyMessage(makeMsg({ rawText: "[表情回应: heart]" }));
    expect(itemCodes(results)).toContain("K1");
  });

  // ==========================================================================
  // C1: Creative/sharing
  // ==========================================================================
  it.each([
    "我觉得这个工具很有创意啊",
    "我发现了一个新玩法很不错",
    "分享一个好东西给大家看看",
    "试试这个新方法效果真的很好",
    "发现了一个非常好用的技巧",
    "我试了一下确实很有意思啊",
    "推荐大家用这个新工具试试",
    "换了一种不一样的思路来试试",
    "我有个想法想跟大家分享一下",
    "这个AI的妙用确实很厉害啊",
    "用AI做了个连连看小游戏给大家玩玩",
    "我做了个这样的小项目来试试效果",
    "这是我自己玩玩做的小东西哈哈哈",
    "试一下这个新工具效果如何呢",
  ])("C1: keyword in text '%s'", (text) => {
    const results = classifyMessage(makeMsg({ rawText: text }));
    expect(itemCodes(results)).toContain("C1");
  });

  it("C1: not triggered for short unrelated text", () => {
    const results = classifyMessage(makeMsg({ rawText: "好的" }));
    expect(itemCodes(results)).not.toContain("C1");
  });

  // ==========================================================================
  // C3: Prompt/template sharing
  // ==========================================================================
  it.each([
    "我写了一个prompt分享给大家看看效果",
    "这个提示词模板确实很好用啊",
    "换一种指令试试看效果如何呢",
    "这种提问方式效果真的很不一样",
    "换一种问法试试看效果怎样啊",
    "这是我的AI咒语分享给大家看看",
    "AI说我应该这样优化代码结构",
    "我问AI这个问题它给的答案很好",
    "我让AI帮我写了这样一个脚本",
    "我是这样问的看看效果如何啊",
    "这样写prompt效果好很多了",
    "我的系统提示是这样设置的啊",
    "分享一个角色设定给大家参考一下",
  ])("C3: keyword in text '%s'", (text) => {
    const results = classifyMessage(makeMsg({ rawText: text }));
    expect(itemCodes(results)).toContain("C3");
  });

  // ==========================================================================
  // G1: Learning reflection
  // ==========================================================================
  it.each([
    "完成学习打卡今天的内容了",
    "完成视频学习确实很有收获",
    "看完了今天的全部内容啦",
    "听过这节课感觉学到了很多呢",
    "读了这个材料收获真的很大",
    "学习心得分享一下给大家看看",
    "我的学习笔记整理出来了",
    "总结一下今天的学习内容吧",
    "有点挑战但是学到很多新知识",
    "今天学到不少东西真不错",
    "今天学到了不少东西",
    "收获很大，理解了RAG的原理",
    "反思了一下自己的学习方法",
    "看完课程后对AI有了新的认识",
  ])("G1: keyword in text '%s'", (text) => {
    const results = classifyMessage(makeMsg({ rawText: text }));
    expect(itemCodes(results)).toContain("G1");
  });

  // ==========================================================================
  // G2: URL sharing
  // ==========================================================================
  it("G2: detects URL in text", () => {
    const results = classifyMessage(makeMsg({ rawText: "分享一个链接 https://example.com/article" }));
    expect(itemCodes(results)).toContain("G2");
  });

  // ==========================================================================
  // H1: File attachment
  // ==========================================================================
  it("H1: detects file attachments", () => {
    const results = classifyMessage(makeMsg({ messageType: "file", rawText: "作业提交作业提交", attachmentCount: 1 }));
    expect(itemCodes(results)).toContain("H1");
  });

  // ==========================================================================
  // H2: Image
  // ==========================================================================
  it("H2: detects image messages", () => {
    const results = classifyMessage(makeMsg({ messageType: "image" }));
    expect(itemCodes(results)).toContain("H2");
  });

  // ==========================================================================
  // H3: Video check-in
  // ==========================================================================
  it("H3: detects video completion keywords", () => {
    const results = classifyMessage(makeMsg({ rawText: "完成视频打卡今天的内容很精彩" }));
    expect(itemCodes(results)).toContain("H3");
  });

  // ==========================================================================
  // K4: AI error correction
  // ==========================================================================
  it("K4: detects error correction keywords", () => {
    const results = classifyMessage(makeMsg({ rawText: "我发现AI这里有个错误需要纠正一下" }));
    expect(itemCodes(results)).toContain("K4");
  });

  // ==========================================================================
  // S1: Peer help
  // ==========================================================================
  it.each([
    "谁知道这个问题怎么解决啊？",
    "请教一下大家这个要怎么做呢",
    "帮忙看看这个代码有什么问题",
    "问一下大家有没有遇到过这种情况",
    "求助大家一个问题非常急谢谢",
  ])("S1: keyword in text '%s'", (text) => {
    const results = classifyMessage(makeMsg({ rawText: text }));
    expect(itemCodes(results)).toContain("S1");
  });

  it("S1: triggers for @mention of non-bot member", () => {
    const results = classifyMessage(makeMsg({ rawText: "@杨斌 这个问题怎么解决", mentionedBotIds: [] }));
    expect(itemCodes(results)).toContain("S1");
  });

  it("S1: triggers even for @bot messages (handler filters @Bot before classifyMessage)", () => {
    // @Bot filtering happens in createMessageCommandHandler, not in classifyMessage.
    // By the time classifyMessage runs, @Bot messages have already been returned early.
    const results = classifyMessage(makeMsg({
      rawText: "@奇点小助教 如何提高社交分数",
      mentionedBotIds: ["ou_e271b45da7e392a822c3f0d8cc7d82ec"],
    }));
    expect(itemCodes(results)).toContain("S1");
  });

  // ==========================================================================
  // K1: Check-in (always included)
  // ==========================================================================
  it("K1: always included for any message", () => {
    const results = classifyMessage(makeMsg({ rawText: "hi" }));
    expect(itemCodes(results)).toContain("K1");
  });

  // ==========================================================================
  // K3: Long text fallback
  // ==========================================================================
  it("K3: triggered for long text (50+ chars) without other matches", () => {
    const longText =
      "今天天气真不错阳光明媚万里无云特别适合出门散步呼吸一下新鲜空气感受大自然的美好时光心旷神怡舒服极了真好";
    const results = classifyMessage(makeMsg({ rawText: longText }));
    expect(itemCodes(results)).toContain("K3");
  });

  it("K3: NOT triggered when other dimensions already matched", () => {
    const longCreative =
      "今天我发现了超级好用的AI新工具真的非常推荐大家试试效果很好快分享给大家看看点赞点赞";
    const results = classifyMessage(makeMsg({ rawText: longCreative }));
    expect(itemCodes(results)).toContain("C1");
    expect(itemCodes(results)).not.toContain("K3");
  });

  // ==========================================================================
  // Multi-dimensional: single message triggers multiple items
  // ==========================================================================
  it("single message can trigger multiple scoring dimensions", () => {
    const results = classifyMessage(makeMsg({
      rawText: "我完成视频学习了发现了一个很好的prompt模板分享给大家 https://example.com",
    }));
    const codes = itemCodes(results);
    expect(codes).toContain("H3");
    expect(codes).toContain("C1");
    expect(codes).toContain("C3");
    expect(codes).toContain("G2");
    expect(codes).toContain("K1");
  });

  // ==========================================================================
  // Short text: K1 only
  // ==========================================================================
  it("short text only produces K1", () => {
    const results = classifyMessage(makeMsg({ rawText: "ok" }));
    expect(itemCodes(results)).toEqual(["K1"]);
  });

  // ==========================================================================
  // Reaction detection
  // ==========================================================================
  it("reaction messages produce C2 even if short", () => {
    const results = classifyMessage(makeMsg({ rawText: "[表情回应: heart]" }));
    expect(itemCodes(results)).toContain("C2");
    expect(itemCodes(results)).toContain("K1");
  });
});
