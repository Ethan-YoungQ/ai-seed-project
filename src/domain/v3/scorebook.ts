export function combineLegacyAndV3Score(input: {
  legacyTotal: number;
  approvedV3Total: number;
}): number {
  return input.legacyTotal + input.approvedV3Total;
}
