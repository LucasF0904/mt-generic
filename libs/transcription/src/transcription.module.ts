import { Module } from '@nestjs/common';
import { CURRENT_PLATFORM, PlatformModule, SupportedPlatform } from '@mt/platform';
import { TranscriptionService } from './transcription.service';
import { AUDIO_EXTRACTOR } from './audio-extractor';
import { TRANSCRIBER } from './transcriber';
import { FfmpegAudioExtractor } from './ffmpeg-audio-extractor';
import { WhisperCppAdapter } from './whisper-cpp.adapter';

@Module({
  imports: [PlatformModule],
  providers: [
    TranscriptionService,
    { provide: AUDIO_EXTRACTOR, useClass: FfmpegAudioExtractor },
    {
      provide: TRANSCRIBER,
      useFactory: (platform: SupportedPlatform) => new WhisperCppAdapter(platform),
      inject: [CURRENT_PLATFORM],
    },
  ],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
