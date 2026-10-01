/** Half-up round to 2 decimal places. */
export function roundScore2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Clamp a headline score to 0–100 and round to 2 decimal places. */
export function clampScore2(value: number): number {
  return Math.min(100, Math.max(0, roundScore2(value)));
}
