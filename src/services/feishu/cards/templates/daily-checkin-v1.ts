import type { FeishuCardJson } from "../types.js";
import { buildHeader } from "./common/header.js";

export const DAILY_CHECKIN_TEMPLATE_ID = "daily-checkin-v1" as const;

export type DailyCheckinItemCode = "K3" | "K4" | "H2" | "C1" | "C3" | "G2";

export interface DailyCheckinItemState {
  pending: string[];  // memberIds 审核中
  approved: string[]; // memberIds ✓
}

export interface DailyCheckinState {
  periodNumber: number;
  periodId: string;
  postedAt: string;
  items: Record<DailyCheckinItemCode, DailyCheckinItemState>;
  memberDisplayNames: Record<string, string>;
}

interface ItemDefinition {
  code: DailyCheckinItemCode;
  label: string;
  actionName: string;
}

const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { code: "K3", label: "🧠 知识总结", actionName: "daily_checkin_k3_submit" },
  { code: "K4", label: "🔍 AI纠错", actionName: "daily_checkin_k4_submit" },
  { code: "H2", label: "🔧 实操分享", actionName: "daily_checkin_h2_submit" },
  { code: "C1", label: "💡 创意用法", actionName: "daily_checkin_c1_submit" },
  { code: "C3", label: "📐 提示词模板", actionName: "daily_checkin_c3_submit" },
  { code: "G2", label: "🌱 课外好资源", actionName: "daily_checkin_g2_submit" }
] as const;

export function emptyDailyCheckinState(input: {
  periodNumber: number;
  postedAt: string;
  periodId: string;
}): DailyCheckinState {
  return {
    periodNumber: input.periodNumber,
    postedAt: input.postedAt,
    periodId: input.periodId,
    items: {
      K3: { pending: [], approved: [] },
      K4: { pending: [], approved: [] },
      H2: { pending: [], approved: [] },
      C1: { pending: [], approved: [] },
      C3: { pending: [], approved: [] },
      G2: { pending: [], approved: [] }
    },
    memberDisplayNames: {}
  };
}

function renderMemberList(
  members: string[],
  marker: "✓" | "审核中",
  names: Record<string, string>
): string {
  if (members.length === 0) return "—";
  return members.map((id) => `${marker} ${names[id] ?? id}`).join("  ·  ");
}

function buildH2FormBlock(
  def: ItemDefinition,
  item: DailyCheckinItemState,
  names: Record<string, string>
): Array<Record<string, unknown>> {
  const approvedLine = renderMemberList(item.approved, "✓", names);
  const pendingLine = renderMemberList(item.pending, "审核中", names);
  return [
    {
      tag: "markdown",
      content: `**${def.label}**\n${approvedLine}\n${pendingLine}`
    },
    {
      tag: "form",
      name: "h2_form",
      elements: [
        {
          tag: "input",
          name: "h2_text",
          placeholder: { tag: "plain_text", content: "描述你的实操内容（至少20字）" },
          max_length: 500
        },
        {
          tag: "select_file",
          name: "h2_file",
          placeholder: { tag: "plain_text", content: "选择截图文件" }
        },
        {
          tag: "button",
          name: "h2_submit",
          text: { tag: "plain_text", content: `提交 ${def.code}` },
          type: "primary",
          behaviors: [
            {
              type: "callback",
              value: {
                action: def.actionName,
                text: "${h2_text.value}",
                file_key: "${h2_file.value}"
              }
            }
          ]
        }
      ]
    }
  ];
}

function buildItemBlock(
  def: ItemDefinition,
  item: DailyCheckinItemState,
  names: Record<string, string>
): Array<Record<string, unknown>> {
  if (def.code === "H2") {
    return buildH2FormBlock(def, item, names);
  }
  const approvedLine = renderMemberList(item.approved, "✓", names);
  const pendingLine = renderMemberList(item.pending, "审核中", names);
  return [
    {
      tag: "markdown",
      content: `**${def.label}**\n${approvedLine}\n${pendingLine}`
    },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: `提交 ${def.code}` },
          type: "primary",
          value: { action: def.actionName, itemCode: def.code }
        }
      ]
    }
  ];
}

export function buildDailyCheckinCard(state: DailyCheckinState): FeishuCardJson {
  const elements: Array<Record<string, unknown>> = [];
  for (const def of ITEM_DEFINITIONS) {
    const block = buildItemBlock(def, state.items[def.code], state.memberDisplayNames);
    elements.push(...block);
    elements.push({ tag: "hr" });
  }
  elements.pop(); // drop trailing hr

  return {
    schema: "2.0",
    header: buildHeader({
      title: `今日打卡 - 第 ${state.periodNumber} 期`,
      subtitle: "K3 K4 H2 C1 C3 G2 · 点击对应按钮提交",
      template: "green"
    }) as unknown as Record<string, unknown>,
    body: { elements }
  };
}
