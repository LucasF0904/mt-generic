import { Inject, Injectable } from '@nestjs/common';
import { AudioMode, RecordingSession, SessionRepository, SESSION_REPOSITORY } from '@mt/domain';
import { InputLogger, InputLoggerHandle, INPUT_LOGGER } from './input-logger';

interface StopAndStageParams {
  profileName: string;
  displayIndex: number;
  audioMode: AudioMode;
  videoPath: string;
  storageRoot: string;
  inputEventsPath?: string;
}

@Injectable()
export class RecordingService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(INPUT_LOGGER) private readonly inputLogger: InputLogger,
  ) {}

  /**
   * Starts click/window (always) + raw-key (opt-in) logging for a new
   * recording. Never throws: if the logger itself can't come up, callers see
   * that via `stop()`'s `crashed` flag, not an exception here.
   */
  startInputLogging(
    captureRawKeys: boolean,
    storageRoot: string,
  ): Promise<{ handle: InputLoggerHandle; outputPath: string }> {
    return this.inputLogger.start({ captureRawKeys }, storageRoot);
  }

  async stopAndStage(params: StopAndStageParams): Promise<RecordingSession> {
    return this.sessions.stage({
      profileName: params.profileName,
      displayIndex: params.displayIndex,
      audioMode: params.audioMode,
      sourceVideoPath: params.videoPath,
      storageRoot: params.storageRoot,
      inputEventsPath: params.inputEventsPath,
    });
  }

  listPending(storageRoot: string): Promise<RecordingSession[]> {
    return this.sessions.listPending(storageRoot);
  }

  markProcessed(session: RecordingSession, storageRoot: string): Promise<void> {
    return this.sessions.markProcessed(session, storageRoot);
  }
}
