import type {
  AnnouncementType,
  BoardRankingEntry,
  WarningRecord
} from "../../domain/types";

interface RenderAnnouncementInput {
  type: AnnouncementType;
  entries: BoardRankingEntry[];
  warnings: WarningRecord[];
}

export function renderAnnouncement(input: RenderAnnouncementInput) {
  switch (input.type) {
    case "biweekly_ranking": {
      if (input.entries.length === 0) {
        return "\u672c\u53cc\u5468\u6682\u65e0\u53ef\u516c\u5f00\u5c55\u793a\u7684\u6392\u884c\u6210\u7ee9\u3002";
      }

      const lines = input.entries
        .slice(0, 5)
        .map((entry) => `${entry.rank}. ${entry.memberName} ${entry.totalScore}\u5206`);

      return [
        "\u3010\u53cc\u5468\u6392\u884c\u699c\u3011",
        ...lines,
        "",
        `\u672c\u671f\u4e0a\u699c\u4eba\u6570\uff1a${input.entries.length}`
      ].join("\n");
    }
    case "status_change": {
      if (input.warnings.length === 0) {
        return "\u5f53\u524d\u6682\u65e0\u72b6\u6001\u53d8\u5316\u63d0\u9192\u3002";
      }

      const latest = input.warnings.at(-1)!;
      return `\u3010\u72b6\u6001\u53d8\u5316\u3011${latest.memberId} \u5f53\u524d\u7b49\u7ea7\uff1a${latest.level}`;
    }
    case "submission_summary":
      return "\u3010\u63d0\u4ea4\u6c47\u603b\u3011\u8bf7\u5728\u8fd0\u8425\u540e\u53f0\u67e5\u770b\u672c\u671f\u63d0\u4ea4\u660e\u7ec6\u3002";
    case "deadline_reminder":
      return "\u3010\u622a\u6b62\u63d0\u9192\u3011\u8bf7\u8fd8\u672a\u63d0\u4ea4\u7684\u540c\u5b66\u5728\u622a\u6b62\u524d\u5b8c\u6210\u6709\u6548\u4f5c\u4e1a\u3002";
    default:
      return "\u6682\u65e0\u64ad\u62a5\u5185\u5bb9\u3002";
  }
}
