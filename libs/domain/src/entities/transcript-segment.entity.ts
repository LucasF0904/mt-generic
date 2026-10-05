export class TranscriptSegment {
  constructor(
    public readonly startSeconds: number,
    public readonly endSeconds: number,
    public readonly text: string,
  ) {
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      throw new Error('TranscriptSegment timestamps must be finite numbers');
    }
    if (startSeconds < 0 || endSeconds < 0) {
      throw new Error('TranscriptSegment timestamps must not be negative');
    }
    if (endSeconds < startSeconds) {
      throw new Error('TranscriptSegment endSeconds must not precede startSeconds');
    }
  }
}
