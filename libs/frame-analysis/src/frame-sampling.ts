/**
 * Turns FFmpeg's detected scene-change timestamps into the final list of
 * moments to send to the vision model: every real scene change, plus extra
 * evenly-spaced fallback timestamps wherever the gap between two of them (or
 * from the start, or to the end of the video) exceeds `maxGapSeconds` —
 * the "no clear cut" cases from design spec §9 (slow scrolling, someone
 * typing). Always includes t=0.
 *
 * The 1.5s default gap is spec §16's own placeholder, flagged there as
 * needing empirical tuning against real recordings — kept as one pure,
 * independently-testable function specifically so that tuning is a one-line
 * change later, not a hunt through the pipeline.
 */
export function fillGapsWithFallback(
  sceneChangeTimestamps: number[],
  durationSeconds: number,
  maxGapSeconds: number,
): number[] {
  const sorted = [...new Set(sceneChangeTimestamps)]
    .filter((t) => Number.isFinite(t) && t >= 0 && t <= durationSeconds)
    .sort((a, b) => a - b);

  const result: number[] = [0];
  let cursor = 0;

  for (const timestamp of sorted) {
    if (timestamp <= cursor) {
      continue;
    }
    while (timestamp - cursor > maxGapSeconds) {
      cursor += maxGapSeconds;
      result.push(cursor);
    }
    result.push(timestamp);
    cursor = timestamp;
  }

  while (durationSeconds - cursor > maxGapSeconds) {
    cursor += maxGapSeconds;
    result.push(cursor);
  }

  return result;
}
