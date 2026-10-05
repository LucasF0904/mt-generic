export interface VisionDescriber {
  /** Describes an image file's visible content (text + what's happening). */
  describe(imagePath: string): Promise<string>;
}

export const VISION_DESCRIBER = Symbol('VISION_DESCRIBER');
