export function roundScore2(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatScore2(value: unknown, fallback = "—"): string {
  const rounded = roundScore2(value);
  return rounded == null ? fallback : rounded.toFixed(2);
}

export function formatScore2OutOf100(value: unknown, fallback = "—"): string {
  const formatted = formatScore2(value, fallback);
  return formatted === fallback ? fallback : `${formatted}/100`;
}

export function formatScore2Percent(value: unknown, fallback = "—"): string {
  const formatted = formatScore2(value, fallback);
  return formatted === fallback ? fallback : `${formatted}%`;
}
