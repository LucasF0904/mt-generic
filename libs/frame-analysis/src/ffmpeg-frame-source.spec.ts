import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { FfmpegFrameSource } from './ffmpeg-frame-source';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

const stub = (stdout: string, stderr = '') => {
  vi.mocked(execFile).mockImplementation(((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(null, stdout, stderr);
  }) as any);
};

describe('FfmpegFrameSource', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(execFile).mockReset();
    delete process.env.MT_SCENE_THRESHOLD;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getDurationSeconds', () => {
    it('parses ffprobe stdout as a float', async () => {
      stub('123.456000\n');

      const duration = await new FfmpegFrameSource().getDurationSeconds('/srv/rec.mkv');

      expect(duration).toBe(123.456);
      const [command, args] = vi.mocked(execFile).mock.calls[0];
      expect(command).toBe('ffprobe');
      expect(args).toContain('/srv/rec.mkv');
    });

    it('throws when ffprobe does not return a parseable duration', async () => {
      stub('N/A\n');

      await expect(new FfmpegFrameSource().getDurationSeconds('/srv/rec.mkv')).rejects.toThrow(
        'não retornou uma duração válida',
      );
    });
  });

  describe('detectSceneChangeTimestamps', () => {
    it('parses pts_time from showinfo lines on stderr, using the default threshold', async () => {
      stub(
        '',
        '[Parsed_showinfo_1 @ 0x1] n:0 pts:0 pts_time:0.5\n' +
          '[Parsed_showinfo_1 @ 0x1] n:1 pts:1 pts_time:12.25\n',
      );

      const timestamps = await new FfmpegFrameSource().detectSceneChangeTimestamps('/srv/rec.mkv');

      expect(timestamps).toEqual([0.5, 12.25]);
      const [, args] = vi.mocked(execFile).mock.calls[0];
      expect(args).toContain("select='gt(scene,0.4)',showinfo");
    });

    it('honours MT_SCENE_THRESHOLD', async () => {
      process.env.MT_SCENE_THRESHOLD = '0.6';
      stub('', '');

      await new FfmpegFrameSource().detectSceneChangeTimestamps('/srv/rec.mkv');

      const [, args] = vi.mocked(execFile).mock.calls[0];
      expect(args).toContain("select='gt(scene,0.6)',showinfo");
    });

    it('returns an empty array when no scene changes are reported', async () => {
      stub('', 'no showinfo here');

      await expect(new FfmpegFrameSource().detectSceneChangeTimestamps('/srv/rec.mkv')).resolves.toEqual([]);
    });
  });

  describe('extractFrame', () => {
    it('seeks to the timestamp and extracts a single JPEG frame', async () => {
      stub('');

      await new FfmpegFrameSource().extractFrame('/srv/rec.mkv', 12.5, '/tmp/frame.jpg');

      const [command, args] = vi.mocked(execFile).mock.calls[0];
      expect(command).toBe('ffmpeg');
      expect(args).toEqual(['-y', '-ss', '12.500', '-i', '/srv/rec.mkv', '-frames:v', '1', '-q:v', '3', '/tmp/frame.jpg']);
    });
  });

  it('rejects with the stderr message when the process fails', async () => {
    vi.mocked(execFile).mockImplementation(((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(new Error('exit 1'), '', 'Invalid data found when processing input');
    }) as any);

    await expect(new FfmpegFrameSource().getDurationSeconds('/srv/rec.mkv')).rejects.toThrow(
      'Invalid data found when processing input',
    );
  });
});
