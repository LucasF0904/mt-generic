import { AudioMode } from '../value-objects/audio-mode.value-object';
import { RecordingSession } from '../entities/recording-session.entity';

export interface StageSessionParams {
  profileName: string;
  displayIndex: number;
  audioMode: AudioMode;
  sourceVideoPath: string;
  storageRoot: string;
  /** Absolute path to the input-events.jsonl written by the input logger, if any. */
  inputEventsPath?: string;
}

export interface SessionRepository {
  stage(params: StageSessionParams): Promise<RecordingSession>;
  listPending(storageRoot: string): Promise<RecordingSession[]>;
  markProcessed(session: RecordingSession, storageRoot: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
