import { MeetingNote, Transcript } from '@mt/domain';

export interface SynthesisContext {
  profileName: string;
  recordedAt: Date;
  /** Rendered merged timeline (transcript + input + frames — design spec §9), when available. */
  timelineText?: string;
}

export interface Synthesizer {
  /** Turns a transcript into a structured {@link MeetingNote} via an LLM. */
  synthesize(transcript: Transcript, context: SynthesisContext): Promise<MeetingNote>;
}

export const SYNTHESIZER = Symbol('SYNTHESIZER');
