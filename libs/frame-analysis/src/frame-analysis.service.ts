import { Inject, Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FrameAnalysis } from '@mt/domain';
import { FrameSource, FRAME_SOURCE } from './frame-source';
import { VisionDescriber, VISION_DESCRIBER } from './vision-describer';
import { fillGapsWithFallback } from './frame-sampling';

const DEFAULT_MAX_GAP_SECONDS = 1.5;

@Injectable()
export class FrameAnalysisService {
  constructor(
    @Inject(FRAME_SOURCE) private readonly frameSource: FrameSource,
    @Inject(VISION_DESCRIBER) private readonly vision: VisionDescriber,
  ) {}

  /**
   * Samples the recording at every detected scene change (plus fallback
   * timestamps for gaps too large to trust — design spec §9) and describes
   * each frame with the vision model. Frames are processed one at a time,
   * not concurrently: a local vision model is GPU/RAM-heavy, and this
   * pipeline already has no deadline to hit (spec §1).
   *
   * `onProgress`, when given, is called after each frame finishes with
   * (framesDone, totalFrames) — the total is known upfront (sampling happens
   * before any frame is described), so callers can render "3/9" directly.
   */
  async analyze(videoPath: string, onProgress?: (done: number, total: number) => void, outputDirectory?: string): Promise<FrameAnalysis[]> {
    const duration = await this.frameSource.getDurationSeconds(videoPath);
    const sceneChanges = await this.frameSource.detectSceneChangeTimestamps(videoPath);
    const maxGapSeconds = Number(process.env.MT_MAX_FRAME_GAP_SECONDS ?? DEFAULT_MAX_GAP_SECONDS);
    const timestamps = fillGapsWithFallback(sceneChanges, duration, maxGapSeconds);

    const tmpDir = outputDirectory ?? await fs.mkdtemp(path.join(os.tmpdir(), 'mt-frames-'));
    if (outputDirectory) await fs.mkdir(outputDirectory, { recursive: true });
    try {
      const analyses: FrameAnalysis[] = [];
      for (const [index, timestamp] of timestamps.entries()) {
        const framePath = path.join(tmpDir, `frame-${timestamp.toFixed(3)}.jpg`);
        await this.frameSource.extractFrame(videoPath, timestamp, framePath);
        const description = await this.vision.describe(framePath);
        analyses.push(new FrameAnalysis(timestamp, description, outputDirectory ? framePath : undefined));
        onProgress?.(index + 1, timestamps.length);
      }
      return analyses;
    } finally {
      if (!outputDirectory) await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }
}
