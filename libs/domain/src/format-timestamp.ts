/** Formats a relative-seconds timestamp as `mm:ss`, clamped to non-negative. */
export function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  const mm = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const ss = (clamped % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
