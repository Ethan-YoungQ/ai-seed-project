import { describe, expect, it } from "vitest";

import { normalizeFeishuMessageEvent } from "../../../src/services/feishu/normalize-message";

describe("normalizeFeishuMessageEvent - post (rich text) messages", () => {
  it("extracts text from a text message (backward compatibility)", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_text_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: JSON.stringify({
            text: "请提交作业 #HW01"
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_text_001",
      memberId: "user-alice",
      rawText: "请提交作业 #HW01",
      parsedTags: ["#HW01"]
    });
  });

  it("extracts text from a post message with title and text blocks", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_post_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "post",
          content: JSON.stringify({
            title: "今日作业",
            content: [
              [{ tag: "text", text: "请大家完成以下任务" }],
              [{ tag: "text", text: "阅读第三章并提交笔记" }]
            ]
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_post_001",
      memberId: "user-alice",
      messageType: "post",
      rawText: "今日作业 请大家完成以下任务 阅读第三章并提交笔记"
    });
  });

  it("extracts text from a post message with image blocks mixed in", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_post_002",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "post",
          content: JSON.stringify({
            title: "打卡",
            content: [
              [{ tag: "text", text: "今天完成了跑步训练" }],
              [{ tag: "img", image_key: "img_v3_sunrise" }],
              [{ tag: "text", text: "配速5分30秒" }]
            ]
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_post_002",
      memberId: "user-alice",
      messageType: "post",
      rawText: "打卡 今天完成了跑步训练 配速5分30秒"
    });
  });

  it("extracts text from a post message with link blocks mixed in", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_post_003",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "post",
          content: JSON.stringify({
            content: [
              [
                { tag: "text", text: "请查看文档：" },
                { tag: "a", text: "飞书文档链接", href: "https://example.com" },
                { tag: "text", text: "并在周五前提交" }
              ]
            ]
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_post_003",
      memberId: "user-alice",
      messageType: "post",
      rawText: "请查看文档： 并在周五前提交"
    });
  });

  it("returns empty string for a post message with no text blocks", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_post_004",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "post",
          content: JSON.stringify({
            content: [
              [{ tag: "img", image_key: "img_v3_photo" }],
              [{ tag: "img", image_key: "img_v3_chart" }]
            ]
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_post_004",
      memberId: "user-alice",
      messageType: "post",
      rawText: ""
    });
  });

  it("falls back to raw content string for non-JSON content", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: { open_id: "user-alice" }
        },
        message: {
          message_id: "om_raw_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: "just plain text, not JSON"
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_raw_001",
      rawText: "just plain text, not JSON"
    });
  });
});
