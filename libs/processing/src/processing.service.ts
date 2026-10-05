import { Injectable, Optional } from '@nestjs/common';
import * as path from 'node:path';
import { MeetingNote, RecordingSession } from '@mt/domain';
import { readInputEvents, RecordingService } from '@mt/recording';
import { TranscriptionService } from '@mt/transcription';
import { SynthesisService } from '@mt/synthesis';
import { GraphRegistration, SecondBrainService, VaultRoutingService } from '@mt/routing';
import { FrameAnalysisService } from '@mt/frame-analysis';
import { buildTimeline, estimateRecordingStart, timelineToText } from './timeline';

export interface ProcessResult {
  notePath: string;
  transcriptPath: string;
  frameAnalysisSkipped: boolean;
  synthesisSkipped: boolean;
  graphRegistration?: GraphRegistration;
  graphError?: string;
}
export interface ProcessingOptions { audioOnly?: boolean; registerSc?: boolean; recordingsRoot?: string; }
export type ProcessingProgress =
  | { stage: 'transcribe'; percent?: number }
  | { stage: 'frames'; done: number; total: number }
  | { stage: 'synthesize' }
  | { stage: 'route' };

@Injectable()
export class ProcessingService {
  constructor(
    private readonly transcription: TranscriptionService,
    private readonly synthesis: SynthesisService,
    private readonly routing: VaultRoutingService,
    private readonly recording: RecordingService,
    private readonly frameAnalysis: FrameAnalysisService,
    @Optional() private readonly secondBrain?: SecondBrainService,
  ) {}

  async process(
    session: RecordingSession,
    storageRoot: string,
    onProgress?: (event: ProcessingProgress) => void,
    options: ProcessingOptions = {},
  ): Promise<ProcessResult> {
    const transcript = await this.transcription.transcribe(session, storageRoot, (percent) =>
      onProgress?.({ stage: 'transcribe', percent }),
    );
    const transcriptPath = await this.routing.writeTranscript(session, transcript, storageRoot);
    const inputEvents = await readInputEvents(session.inputEventsPath);

    let frames: Awaited<ReturnType<FrameAnalysisService['analyze']>> = [];
    let frameAnalysisSkipped = options.audioOnly === true;
    if (!options.audioOnly) try {
      frames = await this.frameAnalysis.analyze(session.videoPath, (done, total) =>
        onProgress?.({ stage: 'frames', done, total }), path.join(path.dirname(session.videoPath), 'frames'),
      );
    } catch {
      // Best-effort: reported to the caller via frameAnalysisSkipped, not logged
      // here — this service layer stays silent and lets the command decide how
      // (or whether) to tell the user, same as every other service in mt.
      frameAnalysisSkipped = true;
    }

    // Only build a timeline when there's real enrichment beyond the transcript
    // itself — otherwise it would just restate the same text a second time in
    // the prompt (transcript segments alone always produce timeline entries).
    const hasEnrichment = inputEvents.length > 0 || frames.length > 0;
    const timelineText = hasEnrichment
      ? timelineToText(buildTimeline(transcript, inputEvents, frames, estimateRecordingStart(session, inputEvents)))
      : undefined;

    let synthesisSkipped = options.audioOnly === true;
    let note = new MeetingNote('Resumo automático não gerado. Consulte a transcrição e os frames abaixo.', [], [], [], []);
    if (!options.audioOnly) {
      onProgress?.({ stage: 'synthesize' });
      try {
        note = await this.synthesis.synthesize(transcript, {
          profileName: session.profileName, recordedAt: session.recordedAt, timelineText,
        });
      } catch { synthesisSkipped = true; }
    }
    onProgress?.({ stage: 'route' });
    const notePath = await this.routing.route(session, note, storageRoot, { transcript, frames, frameAnalysisSkipped });
    let graphRegistration: GraphRegistration | undefined;
    let graphError: string | undefined;
    if (options.registerSc) {
      try { graphRegistration = await this.secondBrain?.register(session, notePath, transcriptPath, note.summary) ?? 'no-profile-memory'; }
      catch (error) { graphError = (error as Error).message; }
    }
    await this.recording.markProcessed(session, options.recordingsRoot ?? storageRoot);
    return { notePath, transcriptPath, frameAnalysisSkipped, synthesisSkipped, graphRegistration, graphError };
  }
}
