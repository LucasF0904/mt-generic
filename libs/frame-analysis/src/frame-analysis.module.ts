import { Module } from '@nestjs/common';
import { FrameAnalysisService } from './frame-analysis.service';
import { FRAME_SOURCE } from './frame-source';
import { FfmpegFrameSource } from './ffmpeg-frame-source';
import { VISION_DESCRIBER } from './vision-describer';
import { OllamaVisionDescriber } from './ollama-vision.describer';

@Module({
  providers: [
    FrameAnalysisService,
    { provide: FRAME_SOURCE, useClass: FfmpegFrameSource },
    { provide: VISION_DESCRIBER, useClass: OllamaVisionDescriber },
  ],
  exports: [FrameAnalysisService],
})
export class FrameAnalysisModule {}
