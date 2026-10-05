import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { AudioMode, RecordingSession, Transcript, TranscriptSegment } from '@mt/domain';
import { TranscriptionService } from './transcription.service';
import { AudioExtractor } from './audio-extractor';
import { Transcriber } from './transcriber';

const session = new RecordingSession(
  '2026-09-03T20-00-00-000Z',
  'equipe',
  0,
  AudioMode.Meeting,
  new Date('2026-09-03T20:00:00.000Z'),
  path.join('/srv/MeetingAI', 'Staging', '2026-09-03T20-00-00-000Z', 'recording.mkv'),
);

describe('TranscriptionService', () => {
  let audio: AudioExtractor;
  let transcriber: Transcriber;
  let service: TranscriptionService;

  beforeEach(() => {
    audio = { toWav: vi.fn().mockResolvedValue(undefined) };
    transcriber = {
      transcribe: vi.fn().mockResolvedValue(new Transcript('pt', [new TranscriptSegment(0, 1, 'oi')])),
    };
    service = new TranscriptionService(audio, transcriber);
  });

  it('extracts audio.wav beside the recording, then transcribes that wav', async () => {
    const wavPath = path.join('/srv/MeetingAI', 'Staging', '2026-09-03T20-00-00-000Z', 'audio.wav');

    const transcript = await service.transcribe(session, '/srv/MeetingAI');

    expect(audio.toWav).toHaveBeenCalledWith(session.videoPath, wavPath);
    expect(transcriber.transcribe).toHaveBeenCalledWith(wavPath, '/srv/MeetingAI', undefined);
    expect(transcript.fullText()).toBe('oi');
  });

  it('forwards an onProgress callback through to the transcriber', async () => {
    const onProgress = vi.fn();
    const wavPath = path.join('/srv/MeetingAI', 'Staging', '2026-09-03T20-00-00-000Z', 'audio.wav');

    await service.transcribe(session, '/srv/MeetingAI', onProgress);

    expect(transcriber.transcribe).toHaveBeenCalledWith(wavPath, '/srv/MeetingAI', onProgress);
  });

  it('does not call the transcriber when audio extraction fails', async () => {
    vi.mocked(audio.toWav).mockRejectedValue(new Error('ffmpeg boom'));

    await expect(service.transcribe(session, '/srv/MeetingAI')).rejects.toThrow('ffmpeg boom');
    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });
});
