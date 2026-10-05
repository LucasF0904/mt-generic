import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { FrameAnalysisService } from './frame-analysis.service';
import { FrameSource } from './frame-source';
import { VisionDescriber } from './vision-describer';

vi.mock('node:fs', () => ({
  promises: {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/mt-frames-abc'),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('FrameAnalysisService', () => {
  const originalEnv = { ...process.env };
  let frameSource: FrameSource;
  let vision: VisionDescriber;
  let service: FrameAnalysisService;

  beforeEach(() => {
    vi.mocked(fs.mkdtemp).mockClear();
    vi.mocked(fs.rm).mockClear();
    frameSource = {
      getDurationSeconds: vi.fn().mockResolvedValue(4),
      detectSceneChangeTimestamps: vi.fn().mockResolvedValue([1]),
      extractFrame: vi.fn().mockResolvedValue(undefined),
    };
    vision = { describe: vi.fn().mockResolvedValue('descrição') };
    service = new FrameAnalysisService(frameSource, vision);
    delete process.env.MT_MAX_FRAME_GAP_SECONDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('extracts and describes a frame for every sampled timestamp, in order, one at a time', async () => {
    const order: string[] = [];
    vi.mocked(frameSource.extractFrame).mockImplementation(async () => {
      order.push('extract');
    });
    vi.mocked(vision.describe).mockImplementation(async () => {
      order.push('describe');
      return 'x';
    });

    const analyses = await service.analyze('/srv/rec.mkv');

    // duration=4, scene change at 1, default 1.5s max gap -> [0, 1, 2.5]
    expect(analyses.map((a) => a.timestampSeconds)).toEqual([0, 1, 2.5]);
    expect(order).toEqual(['extract', 'describe', 'extract', 'describe', 'extract', 'describe']);
  });

  it('passes each frame path from extractFrame straight into describe', async () => {
    await service.analyze('/srv/rec.mkv');

    const [, , framePath] = vi.mocked(frameSource.extractFrame).mock.calls[0];
    expect(vi.mocked(vision.describe)).toHaveBeenCalledWith(framePath);
  });

  it('honours MT_MAX_FRAME_GAP_SECONDS', async () => {
    process.env.MT_MAX_FRAME_GAP_SECONDS = '2';

    const analyses = await service.analyze('/srv/rec.mkv');

    expect(analyses.map((a) => a.timestampSeconds)).toEqual([0, 1, 3]);
  });

  it('reports (done, total) after each frame, total known upfront', async () => {
    const onProgress = vi.fn();

    // duration=4, scene change at 1, default 1.5s max gap -> 3 timestamps: [0, 1, 2.5]
    await service.analyze('/srv/rec.mkv', onProgress);

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('never touches onProgress when it is not given', async () => {
    await expect(service.analyze('/srv/rec.mkv')).resolves.toHaveLength(3);
  });

  it('always cleans up its temp directory, even when a frame fails', async () => {
    vi.mocked(frameSource.extractFrame).mockRejectedValueOnce(new Error('ffmpeg boom'));

    await expect(service.analyze('/srv/rec.mkv')).rejects.toThrow('ffmpeg boom');

    expect(fs.rm).toHaveBeenCalledWith('/tmp/mt-frames-abc', { recursive: true, force: true });
  });
});
