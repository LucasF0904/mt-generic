import { execFile } from 'node:child_process';
import { ProcessResult, ProcessRunner } from './process-runner';

export class ChildProcessRunner implements ProcessRunner {
  run(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): Promise<ProcessResult> {
    return new Promise((resolve) => {
      execFile(command, args, { env: options?.env ?? process.env }, (error, stdout, stderr) => {
        resolve({
          exitCode: error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      });
    });
  }
}
