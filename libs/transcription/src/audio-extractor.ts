export interface AudioExtractor {
  /** Decodes the meeting recording to a 16 kHz mono PCM WAV written at `wavPath`. */
  toWav(videoPath: string, wavPath: string): Promise<void>;
}

export const AUDIO_EXTRACTOR = Symbol('AUDIO_EXTRACTOR');
