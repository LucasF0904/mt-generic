import { describe, expect, it } from 'vitest';
import { TranscriptSegment } from './transcript-segment.entity';

describe('TranscriptSegment', () => {
  it('stores its timestamps and text', () => {
    const segment = new TranscriptSegment(1.5, 4.25, 'olá pessoal');

    expect(segment.startSeconds).toBe(1.5);
    expect(segment.endSeconds).toBe(4.25);
    expect(segment.text).toBe('olá pessoal');
  });

  it('allows a zero-length segment', () => {
    expect(() => new TranscriptSegment(2, 2, 'tick')).not.toThrow();
  });

  it('rejects an end that precedes the start', () => {
    expect(() => new TranscriptSegment(5, 4, 'x')).toThrow('endSeconds must not precede startSeconds');
  });

  it('rejects negative timestamps', () => {
    expect(() => new TranscriptSegment(-1, 2, 'x')).toThrow('must not be negative');
  });

  it('rejects non-finite timestamps', () => {
    expect(() => new TranscriptSegment(0, Number.NaN, 'x')).toThrow('must be finite numbers');
  });
});
