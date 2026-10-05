import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';
import { RecordingSession, Transcript } from '@mt/domain';
import { AudioExtractor, AUDIO_EXTRACTOR } from './audio-extractor';
import { Transcriber, TRANSCRIBER } from './transcriber';

@Injectable()
export class TranscriptionService {
  constructor(
    @Inject(AUDIO_EXTRACTOR) private readonly audio: AudioExtractor,
    @Inject(TRANSCRIBER) private readonly transcriber: Transcriber,
  ) {}

  /** Extracts `audio.wav` next to the session recording and transcribes it. */
  async transcribe(
    session: RecordingSession,
    storageRoot: string,
    onProgress?: (percent: number) => void,
  ): Promise<Transcript> {
    const wavPath = path.join(path.dirname(session.videoPath), 'audio.wav');
    await this.audio.toWav(session.videoPath, wavPath);
    return this.transcriber.transcribe(wavPath, storageRoot, onProgress);
  }
}
