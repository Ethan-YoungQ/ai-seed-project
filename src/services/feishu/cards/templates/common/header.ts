export interface HeaderInput {
  title: string;
  subtitle?: string;
  template: "blue" | "green" | "orange" | "red" | "purple" | "grey";
}

export interface HeaderBlock {
  title: { tag: "plain_text"; content: string };
  subtitle?: { tag: "plain_text"; content: string };
  template: string;
}

export function buildHeader(input: HeaderInput): HeaderBlock {
  const header: HeaderBlock = {
    title: { tag: "plain_text", content: input.title },
    template: input.template
  };
  if (input.subtitle) {
    header.subtitle = { tag: "plain_text", content: input.subtitle };
  }
  return header;
}
