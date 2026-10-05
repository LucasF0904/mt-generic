import { Module } from '@nestjs/common';
import { RecordingModule } from '@mt/recording';
import { TranscriptionModule } from '@mt/transcription';
import { SynthesisModule } from '@mt/synthesis';
import { RoutingModule } from '@mt/routing';
import { FrameAnalysisModule } from '@mt/frame-analysis';
import { ProcessingService } from './processing.service';

@Module({
  imports: [TranscriptionModule, SynthesisModule, RoutingModule, RecordingModule, FrameAnalysisModule],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
