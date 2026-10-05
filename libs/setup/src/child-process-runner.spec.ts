import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { ChildProcessRunner } from './child-process-runner';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('ChildProcessRunner', () => {
  let runner: ChildProcessRunner;

  beforeEach(() => {
    vi.mocked(execFile).mockReset();
    runner = new ChildProcessRunner();
  });

  it('returns exitCode 0 and stdout/stderr when the command succeeds', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: any, cb: any) => {
      cb(null, 'all good', '');
    }) as any);

    const result = await runner.run('ffmpeg', ['-version']);

    expect(result).toEqual({ exitCode: 0, stdout: 'all good', stderr: '' });
  });

  it('maps a numeric error.code to exitCode when the command fails', async () => {
    const error = Object.assign(new Error('failed'), { code: 1 });
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: any, cb: any) => {
      cb(error, '', 'boom');
    }) as any);

    const result = await runner.run('ffmpeg', ['-bad-flag']);

    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: 'boom' });
  });

  it('defaults to exitCode 1 when the error has no numeric code (e.g. ENOENT)', async () => {
    const error = Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' });
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: any, cb: any) => {
      cb(error, '', '');
    }) as any);

    const result = await runner.run('ffmpeg', ['-version']);

    expect(result.exitCode).toBe(1);
  });

  it('passes a custom env through to execFile when provided', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: any, cb: any) => {
      cb(null, '', '');
    }) as any);

    await runner.run('ollama', ['pull', 'llama3.2:3b'], { env: { OLLAMA_MODELS: 'Z:\\models' } as any });

    expect(execFile).toHaveBeenCalledWith(
      'ollama',
      ['pull', 'llama3.2:3b'],
      { env: { OLLAMA_MODELS: 'Z:\\models' } },
      expect.any(Function),
    );
  });
});
