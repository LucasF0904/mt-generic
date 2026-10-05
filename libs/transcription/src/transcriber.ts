import { Transcript } from '@mt/domain';

export interface Transcriber {
  /**
   * Transcribes a WAV file. `storageRoot` locates the whisper.cpp binary and
   * models. `onProgress`, when given, is called with 0-100 as the transcriber
   * works through the audio — best-effort: an implementation that can't
   * measure progress just never calls it.
   */
  transcribe(wavPath: string, storageRoot: string, onProgress?: (percent: number) => void): Promise<Transcript>;
}

export const TRANSCRIBER = Symbol('TRANSCRIBER');
