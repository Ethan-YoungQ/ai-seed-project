export function parseTags(text: string): string[] {
  return [...new Set(text.match(/#[^\s#]+/g) ?? [])];
}
