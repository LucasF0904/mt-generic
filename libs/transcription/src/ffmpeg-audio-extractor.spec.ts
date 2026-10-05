import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { FfmpegAudioExtractor } from './ffmpeg-audio-extractor';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

describe('FfmpegAudioExtractor', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('invokes ffmpeg to write a 16 kHz mono PCM wav without the video track', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => cb(null, '', '')) as any);

    await new FfmpegAudioExtractor().toWav('/srv/rec.mkv', '/srv/audio.wav');

    expect(execFile).toHaveBeenCalledWith(
      'ffmpeg',
      ['-y', '-i', '/srv/rec.mkv', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '/srv/audio.wav'],
      expect.any(Function),
    );
  });

  it('rejects with ffmpeg stderr when the process fails', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) =>
      cb(new Error('exit 1'), '', 'Invalid data found when processing input')) as any);

    await expect(new FfmpegAudioExtractor().toWav('/srv/rec.mkv', '/srv/audio.wav')).rejects.toThrow(
      'Invalid data found when processing input',
    );
  });

  it('falls back to the raw error message when ffmpeg writes nothing to stderr', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) =>
      cb(new Error('spawn ffmpeg ENOENT'), '', '')) as any);

    await expect(new FfmpegAudioExtractor().toWav('/srv/rec.mkv', '/srv/audio.wav')).rejects.toThrow(
      'spawn ffmpeg ENOENT',
    );
  });
});
