export interface MachinePreferences {
  initialized?: boolean;
  defaultProfile?: string;
  defaultVault?: string;
  profileVaults?: Record<string, string>;
  paths?: { config?: string; recordings?: string; models?: string; reports?: string };
  whisperBinary?: string;
  whisperModel?: string;
  summaryModel?: string;
  visionModel?: string;
}

export class MachineConfig {
  constructor(
    public readonly storageRoot: string,
    public readonly resolvedAt: Date,
    // Cached OBS websocket connection details, set by `mt setup --obs-password`
    // once so `mt record`/`mt configure-obs` don't need MT_OBS_URL/MT_OBS_PASSWORD
    // exported in every terminal — OBS 28+ requires a password by default.
    public readonly obsUrl?: string,
    public readonly obsPassword?: string,
    public readonly preferences: MachinePreferences = {},
  ) {
    if (!storageRoot || storageRoot.trim().length === 0) {
      throw new Error('MachineConfig.storageRoot must not be empty');
    }
  }
}
