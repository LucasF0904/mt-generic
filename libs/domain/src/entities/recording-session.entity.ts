import { AudioMode } from '../value-objects/audio-mode.value-object';

export class RecordingSession {
  constructor(
    public readonly sessionId: string,
    public readonly profileName: string,
    // 0-based OBS monitor index. The OBS scene name derived from it is 1-based
    // (`DISPLAY<displayIndex + 1>...`, see DisplayInfo.sceneName).
    public readonly displayIndex: number,
    public readonly audioMode: AudioMode,
    public readonly recordedAt: Date,
    public readonly videoPath: string,
    // Absolute path to input-events.jsonl (clicks/window always; raw keys
    // opt-in — see design spec §7/§9). Undefined when logging wasn't
    // available for this session (e.g. the input logger crashed).
    public readonly inputEventsPath?: string,
  ) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('RecordingSession.sessionId must not be empty');
    }
  }
}
