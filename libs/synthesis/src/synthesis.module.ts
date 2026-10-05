import { Module } from '@nestjs/common';
import { SynthesisService } from './synthesis.service';
import { SYNTHESIZER } from './synthesizer';
import { OllamaSynthesizer } from './ollama.synthesizer';

@Module({
  providers: [SynthesisService, { provide: SYNTHESIZER, useClass: OllamaSynthesizer }],
  exports: [SynthesisService],
})
export class SynthesisModule {}
