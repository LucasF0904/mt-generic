import { describe, expect, it } from 'vitest';
import { Transcript } from './transcript.entity';
import { TranscriptSegment } from './transcript-segment.entity';

describe('Transcript', () => {
  it('joins segment texts, trimmed, into a single string', () => {
    const transcript = new Transcript('pt', [
      new TranscriptSegment(0, 2, '  bom dia  '),
      new TranscriptSegment(2, 4, 'tudo certo?'),
    ]);

    expect(transcript.fullText()).toBe('bom dia tudo certo?');
  });

  it('skips blank segments when building the full text', () => {
    const transcript = new Transcript('pt', [
      new TranscriptSegment(0, 1, '   '),
      new TranscriptSegment(1, 2, 'oi'),
    ]);

    expect(transcript.fullText()).toBe('oi');
  });

  it('is empty when there are no segments or only blank ones', () => {
    expect(new Transcript('pt', []).isEmpty).toBe(true);
    expect(new Transcript('pt', [new TranscriptSegment(0, 1, '  ')]).isEmpty).toBe(true);
    expect(new Transcript('pt', [new TranscriptSegment(0, 1, 'x')]).isEmpty).toBe(false);
  });

  describe('toText', () => {
    it('renders one [mm:ss] line per non-blank segment', () => {
      const transcript = new Transcript('pt', [
        new TranscriptSegment(0, 3, 'bom dia'),
        new TranscriptSegment(65, 68, 'depois de um minuto'),
      ]);

      expect(transcript.toText()).toBe('[00:00] bom dia\n[01:05] depois de um minuto');
    });

    it('skips blank segments', () => {
      const transcript = new Transcript('pt', [
        new TranscriptSegment(0, 1, '   '),
        new TranscriptSegment(1, 2, 'oi'),
      ]);

      expect(transcript.toText()).toBe('[00:01] oi');
    });

    it('is an empty string for a transcript with no segments', () => {
      expect(new Transcript('pt', []).toText()).toBe('');
    });
  });
});
