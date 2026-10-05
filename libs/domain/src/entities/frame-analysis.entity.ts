/**
 * One video frame described by the vision model (design spec §9): the
 * timestamp it was sampled at (relative to the recording's start) and what
 * the model saw — visible text plus what appears to be happening.
 */
export class FrameAnalysis {
  constructor(
    public readonly timestampSeconds: number,
    public readonly description: string,
    public readonly imagePath?: string,
  ) {
    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
      throw new Error('FrameAnalysis.timestampSeconds must be a non-negative finite number');
    }
  }
}
