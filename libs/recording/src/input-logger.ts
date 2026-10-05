export interface InputLoggerOptions {
  /** Opt-in per session (design spec §7 step 5) — clicks + active window are always logged. */
  captureRawKeys: boolean;
}

export interface InputLoggerHandle {
  /** Stops the logger. Never throws — a failed/crashed logger is reported via `crashed`, not an exception. */
  stop(): Promise<{ crashed: boolean }>;
}

export interface InputLogger {
  /** Starts logging into a fresh file under `storageRoot`; returns its path alongside the running handle. */
  start(options: InputLoggerOptions, storageRoot: string): Promise<{ handle: InputLoggerHandle; outputPath: string }>;
}

export const INPUT_LOGGER = Symbol('INPUT_LOGGER');
