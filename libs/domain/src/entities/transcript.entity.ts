import { TranscriptSegment } from './transcript-segment.entity';
import { formatTimestamp } from '../format-timestamp';

export class Transcript {
  constructor(
    public readonly language: string,
    public readonly segments: TranscriptSegment[],
  ) {}

  get isEmpty(): boolean {
    return this.fullText().length === 0;
  }

  fullText(): string {
    return this.segments
      .map((segment) => segment.text.trim())
      .filter((text) => text.length > 0)
      .join(' ');
  }

  /** One `[mm:ss] texto` line per non-blank segment — the raw transcript, unedited. */
  toText(): string {
    return this.segments
      .filter((segment) => segment.text.trim().length > 0)
      .map((segment) => `[${formatTimestamp(segment.startSeconds)}] ${segment.text.trim()}`)
      .join('\n');
  }
}
