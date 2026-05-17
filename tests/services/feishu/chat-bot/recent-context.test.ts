import { describe, expect, it, vi } from "vitest";

import { createRecentChatContextProvider } from "../../../../src/services/feishu/chat-bot/recent-context";
import type { NormalizedFeishuMessage } from "../../../../src/services/feishu/normalize-message";

function makeMsg(overrides: Partial<NormalizedFeishuMessage>): NormalizedFeishuMessage {
  return {
    messageId: "m1",
    memberId: "u1",
    chatId: "c1",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: "2026-05-03T12:00:00.000Z",
    rawText: "",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: "",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

describe("createRecentChatContextProvider", () => {
  it("resolves same-user recent PDF context for homework analysis requests", async () => {
    const provider = createRecentChatContextProvider({
      documentExtractor: {
        extract: vi.fn().mockResolvedValue({
          status: "parsed",
          text: "第二提问：业务场景中如何提升客户触达准确性？",
        }),
      },
    });
    const feishuClient = {
      getMessageFile: vi.fn().mockResolvedValue({
        fileKey: "file-lijiexian",
        fileName: "个人报告任务一李洁娴.pdf",
        fileExt: "pdf",
        bytes: Buffer.from("%PDF fake"),
      }),
    };

    provider.record(makeMsg({
      messageId: "m-file",
      messageType: "file",
      eventTime: "2026-05-03T11:58:00.000Z",
      fileKey: "file-lijiexian",
      fileName: "个人报告任务一李洁娴.pdf",
      fileExt: "pdf",
      documentParseStatus: "pending",
    }));

    provider.record(makeMsg({
      messageId: "m-other-user-file",
      memberId: "u2",
      messageType: "file",
      eventTime: "2026-05-03T11:59:00.000Z",
      fileKey: "file-other",
      fileName: "别人作业.pdf",
      fileExt: "pdf",
      documentParseStatus: "pending",
    }));

    const blocks = await provider.resolveMentionContext({
      currentMessage: makeMsg({
        messageId: "m-mention",
        eventTime: "2026-05-03T12:00:00.000Z",
        rawText: "@_user_1 麻烦结合我交的作业，分析针对业务场景的第二提问是否准确",
        cleanedText: "麻烦结合我交的作业，分析针对业务场景的第二提问是否准确",
        mentionedBotIds: ["ou_bot"],
      }),
      feishuClient: feishuClient as any,
    });

    expect(feishuClient.getMessageFile).toHaveBeenCalledWith({
      messageId: "m-file",
      fileKey: "file-lijiexian",
      fileName: "个人报告任务一李洁娴.pdf",
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].title).toBe("用户最近文件");
    expect(blocks[0].content).toContain("个人报告任务一李洁娴.pdf");
    expect(blocks[0].content).toContain("第二提问");
    expect(blocks[0].content).not.toContain("别人作业");
    expect(blocks[1].title).toBe("用户近期上下文");
  });

  it("includes local group context for 上文 style requests", async () => {
    const provider = createRecentChatContextProvider();

    provider.record(makeMsg({
      messageId: "m-teacher",
      memberId: "trainer-1",
      eventTime: "2026-05-03T11:55:00.000Z",
      rawText: "业务场景提问要包含对象、目标和约束。",
    }));
    provider.record(makeMsg({
      messageId: "m-user",
      memberId: "u1",
      eventTime: "2026-05-03T11:56:00.000Z",
      rawText: "我的第二提问是：如何让客户更愿意参与？",
    }));

    const blocks = await provider.resolveMentionContext({
      currentMessage: makeMsg({
        messageId: "m-mention",
        eventTime: "2026-05-03T12:00:00.000Z",
        cleanedText: "结合上文看这个问题是否准确？",
        rawText: "@_user_1 结合上文看这个问题是否准确？",
      }),
      feishuClient: {} as any,
    });

    expect(blocks.some((block) => block.title === "群聊局部上文")).toBe(true);
    expect(blocks.map((block) => block.content).join("\n")).toContain("对象、目标和约束");
  });

  it("includes recent group context for ordinary bot mentions so score corrections stay grounded", async () => {
    const provider = createRecentChatContextProvider();

    provider.record(makeMsg({
      messageId: "m-share",
      memberId: "u1",
      eventTime: "2026-05-03T11:57:00.000Z",
      rawText: "我给客户演示了 ChatGPT 海报设计，对方自己操作了一遍。",
    }));
    provider.record(makeMsg({
      messageId: "m-bot-praise",
      memberId: "app-bot",
      senderType: "app",
      eventTime: "2026-05-03T11:58:00.000Z",
      rawText: "@陈文超 AI 实战的亮点很清楚，这波 4 分拿得漂亮",
    }));

    const blocks = await provider.resolveMentionContext({
      currentMessage: makeMsg({
        messageId: "m-mention",
        eventTime: "2026-05-03T12:00:00.000Z",
        cleanedText: "不用加分，纯瞎聊",
        rawText: "@_user_1 不用加分，纯瞎聊",
        mentionedBotIds: ["ou_bot"],
      }),
      feishuClient: {} as any,
    });

    const groupContext = blocks.find((block) => block.title === "群聊局部上文");
    expect(groupContext?.content).toContain("ChatGPT 海报设计");
    expect(groupContext?.content).toContain("4 分拿得漂亮");
  });

  it("includes the trigger user's last five text messages for ordinary bot mentions", async () => {
    const provider = createRecentChatContextProvider();

    for (let i = 1; i <= 6; i += 1) {
      provider.record(makeMsg({
        messageId: `m-user-${i}`,
        memberId: "u1",
        eventTime: `2026-05-03T11:${String(40 + i).padStart(2, "0")}:00.000Z`,
        rawText: `用户自己的第 ${i} 段发言`,
      }));
    }
    provider.record(makeMsg({
      messageId: "m-other",
      memberId: "u2",
      eventTime: "2026-05-03T11:50:30.000Z",
      rawText: "其他人的发言不应该进入用户近期上下文",
    }));

    const blocks = await provider.resolveMentionContext({
      currentMessage: makeMsg({
        messageId: "m-mention",
        eventTime: "2026-05-03T12:00:00.000Z",
        cleanedText: "你觉得我刚才说的方向怎么样？",
        rawText: "@_user_1 你觉得我刚才说的方向怎么样？",
      }),
      feishuClient: {} as any,
    });

    const userContext = blocks.find((block) => block.title === "触发用户最近发言");
    expect(userContext).toBeDefined();
    expect(userContext!.content).toContain("2026-05-03 11:42");
    expect(userContext!.content).toContain("用户自己的第 2 段发言");
    expect(userContext!.content).toContain("用户自己的第 6 段发言");
    expect(userContext!.content).not.toContain("用户自己的第 1 段发言");
    expect(userContext!.content).not.toContain("其他人的发言");
  });

  it("keeps default context clean: latest 10 messages and 2 files only", async () => {
    const provider = createRecentChatContextProvider({
      documentExtractor: {
        extract: vi.fn().mockResolvedValue({
          status: "parsed",
          text: "文件内容",
        }),
      },
    });
    const feishuClient = {
      getMessageFile: vi.fn().mockResolvedValue({
        fileKey: "file",
        fileName: "作业.pdf",
        fileExt: "pdf",
        bytes: Buffer.from("%PDF fake"),
      }),
    };

    for (let i = 1; i <= 12; i += 1) {
      provider.record(makeMsg({
        messageId: `m-text-${i}`,
        eventTime: `2026-05-03T11:${String(i).padStart(2, "0")}:00.000Z`,
        rawText: `上下文消息 ${i}`,
      }));
    }

    for (let i = 1; i <= 3; i += 1) {
      provider.record(makeMsg({
        messageId: `m-file-${i}`,
        messageType: "file",
        eventTime: `2026-05-03T11:${String(20 + i).padStart(2, "0")}:00.000Z`,
        rawText: "",
        fileKey: `file-${i}`,
        fileName: `作业${i}.pdf`,
        fileExt: "pdf",
        documentParseStatus: "pending",
      }));
    }

    const blocks = await provider.resolveMentionContext({
      currentMessage: makeMsg({
        messageId: "m-mention",
        eventTime: "2026-05-03T12:00:00.000Z",
        cleanedText: "麻烦结合上文和我交的作业分析第二提问",
        rawText: "@_user_1 麻烦结合上文和我交的作业分析第二提问",
      }),
      feishuClient: feishuClient as any,
    });

    expect(blocks.filter((block) => block.title === "用户最近文件")).toHaveLength(2);
    expect(feishuClient.getMessageFile).toHaveBeenCalledTimes(2);

    const userContext = blocks.find((block) => block.title === "用户近期上下文");
    expect(userContext).toBeDefined();
    const userContextLines = userContext!.content.split("\n");
    expect(userContextLines).toHaveLength(10);
    expect(userContextLines.some((line) => line.endsWith("上下文消息 1"))).toBe(false);
    expect(userContext!.content).toContain("作业3.pdf");
  });
});
