/** Blend two #RRGGBB (or #RGB) colors in sRGB; `weightA` is fraction of `a` (0–1). */
export function mixSrgbHex(a: string, b: string, weightA: number): string {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  if (!ca) return cb ? hexFromRgb(cb) : "#000000";
  if (!cb) return hexFromRgb(ca);
  const t = Math.max(0, Math.min(1, weightA));
  const r = Math.round(ca.r * t + cb.r * (1 - t));
  const g = Math.round(ca.g * t + cb.g * (1 - t));
  const bl = Math.round(ca.b * t + cb.b * (1 - t));
  return hexFromRgb({ r, g, b: bl });
}

function hexFromRgb(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const s = String(input).trim();
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
