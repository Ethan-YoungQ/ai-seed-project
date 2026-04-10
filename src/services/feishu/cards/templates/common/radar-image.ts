export interface RadarImageInput {
  baseUrl: string;
  memberId: string;
  windowId: string;
  dims: { K: number; H: number; C: number; S: number; G: number };
}

export function buildRadarImageUrl(input: RadarImageInput): string {
  const base = input.baseUrl.replace(/\/$/, "");
  const query = new URLSearchParams({
    k: String(input.dims.K),
    h: String(input.dims.H),
    c: String(input.dims.C),
    s: String(input.dims.S),
    g: String(input.dims.G)
  });
  return `${base}/radar/${encodeURIComponent(input.memberId)}/${encodeURIComponent(input.windowId)}?${query.toString()}`;
}
