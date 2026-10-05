export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): Promise<ProcessResult>;
}

export const PROCESS_RUNNER = Symbol('PROCESS_RUNNER');
