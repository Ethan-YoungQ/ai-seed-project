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
      const levelLabels = {
        reminder: "提醒",
        warning: "警告",
        elimination: "淘汰"
      } as const;

      return `【状态变化】成员 ${latest.memberId} 当前等级：${levelLabels[latest.level]}`;
    }
    case "submission_summary":
      return "【提交汇总】请查看本期提交明细。";
    case "deadline_reminder":
      return "【截止提醒】请尚未提交的同学在截止前完成有效作业。";
    default:
      return "\u6682\u65e0\u64ad\u62a5\u5185\u5bb9\u3002";
  }
}
