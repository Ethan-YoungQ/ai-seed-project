export interface MemberBadgeInput {
  displayName: string;
  currentLevel: number;
}

export interface MarkdownElement {
  tag: "markdown";
  content: string;
}

export function buildMemberBadge(input: MemberBadgeInput): MarkdownElement {
  return {
    tag: "markdown",
    content: `**${input.displayName}** \`Lv${input.currentLevel}\``
  };
}
