import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AudioMode,
  FrameAnalysis,
  InputEvent,
  MeetingNote,
  RecordingSession,
  Transcript,
  TranscriptSegment,
} from '@mt/domain';
import { ProcessingService } from './processing.service';
import { TranscriptionService } from '@mt/transcription';
import { SynthesisService } from '@mt/synthesis';
import { VaultRoutingService } from '@mt/routing';
import { RecordingService } from '@mt/recording';
import { FrameAnalysisService } from '@mt/frame-analysis';

vi.mock('@mt/recording', async () => {
  const actual = await vi.importActual<typeof import('@mt/recording')>('@mt/recording');
  return { ...actual, readInputEvents: vi.fn() };
});
import { readInputEvents } from '@mt/recording';

const session = new RecordingSession(
  '2026-09-03T20-00-00-000Z',
  'equipe',
  0,
  AudioMode.Meeting,
  new Date('2026-09-03T20:00:00.000Z'),
  '/srv/MeetingAI/Staging/2026-09-03T20-00-00-000Z/recording.mkv',
  '/srv/MeetingAI/Staging/2026-09-03T20-00-00-000Z/input-events.jsonl',
);

describe('ProcessingService', () => {
  let transcription: TranscriptionService;
  let synthesis: SynthesisService;
  let routing: VaultRoutingService;
  let recording: RecordingService;
  let frameAnalysis: FrameAnalysisService;
  let service: ProcessingService;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.mocked(readInputEvents).mockReset().mockResolvedValue([]);
    const transcript = new Transcript('pt', [new TranscriptSegment(0, 1, 'oi')]);
    const note = new MeetingNote('resumo', [], [], [], []);

    transcription = {
      transcribe: vi.fn(async () => {
        calls.push('transcribe');
        return transcript;
      }),
    } as unknown as TranscriptionService;
    synthesis = {
      synthesize: vi.fn(async () => {
        calls.push('synthesize');
        return note;
      }),
    } as unknown as SynthesisService;
    routing = {
      route: vi.fn(async () => {
        calls.push('route');
        return '/vaults/equipe/Meetings/2026-09-03T20-00-00-000Z.md';
      }),
      writeTranscript: vi.fn(async () => {
        calls.push('writeTranscript');
        return '/vaults/equipe/Meetings/2026-09-03T20-00-00-000Z.transcript.txt';
      }),
    } as unknown as VaultRoutingService;
    recording = {
      markProcessed: vi.fn(async () => {
        calls.push('markProcessed');
      }),
    } as unknown as RecordingService;
    frameAnalysis = { analyze: vi.fn().mockResolvedValue([]) } as unknown as FrameAnalysisService;

    service = new ProcessingService(transcription, synthesis, routing, recording, frameAnalysis);
  });

  it('runs transcribe → synthesize → route → writeTranscript → markProcessed in order, returning both paths', async () => {
    const result = await service.process(session, '/srv/MeetingAI');

    expect(calls).toEqual(['transcribe', 'writeTranscript', 'synthesize', 'route', 'markProcessed']);
    expect(routing.route).toHaveBeenCalledWith(session, expect.any(MeetingNote), '/srv/MeetingAI', expect.objectContaining({ transcript: expect.any(Transcript), frames: [] }));
    expect(routing.writeTranscript).toHaveBeenCalledWith(session, expect.any(Transcript), '/srv/MeetingAI');
    expect(recording.markProcessed).toHaveBeenCalledWith(session, '/srv/MeetingAI');
    expect(result).toMatchObject({
      notePath: '/vaults/equipe/Meetings/2026-09-03T20-00-00-000Z.md',
      transcriptPath: '/vaults/equipe/Meetings/2026-09-03T20-00-00-000Z.transcript.txt',
      frameAnalysisSkipped: false,
    });
  });

  it('reports progress through each stage', async () => {
    vi.mocked(transcription.transcribe).mockImplementation(async (_session, _root, onProgress) => {
      onProgress?.(50);
      calls.push('transcribe');
      return new Transcript('pt', [new TranscriptSegment(0, 1, 'oi')]);
    });
    vi.mocked(frameAnalysis.analyze).mockImplementation(async (_video, onProgress) => {
      onProgress?.(1, 2);
      return [];
    });
    const events: unknown[] = [];

    await service.process(session, '/srv/MeetingAI', (event) => events.push(event));

    expect(events).toEqual([
      { stage: 'transcribe', percent: 50 },
      { stage: 'frames', done: 1, total: 2 },
      { stage: 'synthesize' },
      { stage: 'route' },
    ]);
  });

  it('omits timelineText when there are no input events and no frames (nothing beyond the transcript)', async () => {
    await service.process(session, '/srv/MeetingAI');

    expect(synthesis.synthesize).toHaveBeenCalledWith(expect.any(Transcript), {
      profileName: 'equipe',
      recordedAt: session.recordedAt,
      timelineText: undefined,
    });
  });

  it('builds and passes a timelineText when there are frames or input events', async () => {
    vi.mocked(readInputEvents).mockResolvedValue([
      new InputEvent('click', new Date('2026-09-03T19:59:01.000Z'), { x: 1, y: 2, button: 1 }),
    ]);
    vi.mocked(frameAnalysis.analyze).mockResolvedValue([new FrameAnalysis(0, 'tela inicial')]);

    await service.process(session, '/srv/MeetingAI');

    const [, context] = vi.mocked(synthesis.synthesize).mock.calls[0];
    expect(context.timelineText).toContain('tela: tela inicial');
    expect(context.timelineText).toContain('clique em (1, 2)');
  });

  it('degrades to frameAnalysisSkipped=true and keeps going when frame analysis throws', async () => {
    vi.mocked(frameAnalysis.analyze).mockRejectedValue(new Error('ffmpeg ausente'));

    const result = await service.process(session, '/srv/MeetingAI');

    expect(result.frameAnalysisSkipped).toBe(true);
    expect(synthesis.synthesize).toHaveBeenCalled();
    expect(recording.markProcessed).toHaveBeenCalled();
  });

  it('preserves the transcript and writes a complete fallback report when synthesis fails', async () => {
    vi.mocked(synthesis.synthesize).mockRejectedValue(new Error('Ollama offline'));

    const result = await service.process(session, '/srv/MeetingAI');
    expect(result.synthesisSkipped).toBe(true);
    expect(routing.writeTranscript).toHaveBeenCalled();
    expect(routing.route).toHaveBeenCalled();
    expect(recording.markProcessed).toHaveBeenCalled();
  });

  it('does not mark the session processed when writing the note fails', async () => {
    vi.mocked(routing.route).mockRejectedValue(new Error('EACCES'));

    await expect(service.process(session, '/srv/MeetingAI')).rejects.toThrow('EACCES');
    expect(recording.markProcessed).not.toHaveBeenCalled();
  });
});

it('audio-only skips both LLM stages and SC failure never loses the exported files', async () => {
  const transcript = new Transcript('pt', [new TranscriptSegment(0, 1, 'oi')]);
  const synthesis = { synthesize: vi.fn() }; const frames = { analyze: vi.fn() };
  const graph = { register: vi.fn().mockRejectedValue(new Error('locked')) };
  const recording = { markProcessed: vi.fn() };
  const service = new ProcessingService({ transcribe: async () => transcript } as any, synthesis as any,
    { writeTranscript: async () => '/audio.txt', route: async () => '/report.md' } as any, recording as any, frames as any, graph as any);
  const result = await service.process(session, '/root', undefined, { audioOnly: true, registerSc: true, recordingsRoot: '/recordings' });
  expect(synthesis.synthesize).not.toHaveBeenCalled(); expect(frames.analyze).not.toHaveBeenCalled();
  expect(result.graphError).toBe('locked'); expect(result.notePath).toBe('/report.md');
  expect(recording.markProcessed).toHaveBeenCalledWith(session, '/recordings');
});
