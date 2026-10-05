import { Inject, Injectable } from '@nestjs/common';
import { MeetingNote, Transcript } from '@mt/domain';
import { SynthesisContext, Synthesizer, SYNTHESIZER } from './synthesizer';

@Injectable()
export class SynthesisService {
  constructor(@Inject(SYNTHESIZER) private readonly synthesizer: Synthesizer) {}

  async synthesize(transcript: Transcript, context: SynthesisContext): Promise<MeetingNote> {
    if (transcript.isEmpty) {
      throw new Error('transcrição vazia — nada para sintetizar');
    }
    return this.synthesizer.synthesize(transcript, context);
  }
}
