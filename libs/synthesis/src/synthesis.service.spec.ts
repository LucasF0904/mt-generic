import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MeetingNote, Transcript, TranscriptSegment } from '@mt/domain';
import { SynthesisService } from './synthesis.service';
import { Synthesizer } from './synthesizer';

describe('SynthesisService', () => {
  let synthesizer: Synthesizer;
  let service: SynthesisService;
  const context = { profileName: 'equipe', recordedAt: new Date('2026-09-03T20:00:00.000Z') };

  beforeEach(() => {
    synthesizer = { synthesize: vi.fn().mockResolvedValue(new MeetingNote('ok', [], [], [], [])) };
    service = new SynthesisService(synthesizer);
  });

  it('delegates a non-empty transcript to the synthesizer', async () => {
    const transcript = new Transcript('pt', [new TranscriptSegment(0, 1, 'conteúdo real')]);

    await service.synthesize(transcript, context);

    expect(synthesizer.synthesize).toHaveBeenCalledWith(transcript, context);
  });

  it('refuses to synthesize an empty transcript', async () => {
    const empty = new Transcript('pt', [new TranscriptSegment(0, 1, '   ')]);

    await expect(service.synthesize(empty, context)).rejects.toThrow('transcrição vazia');
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
  });
});
