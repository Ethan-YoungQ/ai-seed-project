import { describe, expect, it } from "vitest";

import { normalizeFeishuMessageEvent } from "../../src/services/feishu/normalize-message";

describe("normalizeFeishuMessageEvent", () => {
  it("keeps text message content, parsed tags, and chat metadata", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: {
            open_id: "user-alice"
          }
        },
        message: {
          message_id: "om_text_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: JSON.stringify({
            text: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5199 prompt\uff0c\u518d\u505a\u4e24\u8f6e\u8fed\u4ee3\u3002"
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_text_001",
      memberId: "user-alice",
      chatId: "chat-demo",
      chatType: "group",
      senderType: "user",
      parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"],
      attachmentCount: 0
    });
  });

  it("treats image messages as evidence even when attachments are not present", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: {
            open_id: "user-alice"
          }
        },
        message: {
          message_id: "om_image_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "image",
          content: JSON.stringify({
            image_key: "img_v3_example"
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_image_001",
      memberId: "user-alice",
      chatId: "chat-demo",
      rawText: "",
      attachmentCount: 1,
      attachmentTypes: ["image"]
    });
  });

  it("extracts file metadata from file messages and keeps document fields for later parsing", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: {
          sender_type: "user",
          sender_id: {
            open_id: "user-alice"
          }
        },
        message: {
          message_id: "om_file_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "file",
          content: JSON.stringify({
            file_key: "file_v3_demo",
            file_name: "final report.pdf"
          })
        }
      }
    });

    expect(normalized).toMatchObject({
      messageId: "om_file_001",
      memberId: "user-alice",
      chatId: "chat-demo",
      messageType: "file",
      fileKey: "file_v3_demo",
      fileName: "final report.pdf",
      fileExt: "pdf",
      attachmentCount: 1,
      attachmentTypes: ["file"],
      documentText: "",
      documentParseStatus: "pending"
    });
  });
});
