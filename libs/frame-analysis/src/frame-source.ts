export interface FrameSource {
  getDurationSeconds(videoPath: string): Promise<number>;
  /** Timestamps (seconds) where FFmpeg's perceptual scene-change filter fired. */
  detectSceneChangeTimestamps(videoPath: string): Promise<number[]>;
  /** Extracts a single JPEG frame at `timestampSeconds` to `outputPath`. */
  extractFrame(videoPath: string, timestampSeconds: number, outputPath: string): Promise<void>;
}

export const FRAME_SOURCE = Symbol('FRAME_SOURCE');
