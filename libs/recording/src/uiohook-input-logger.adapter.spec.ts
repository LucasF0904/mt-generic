import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { UiohookInputLogger } from './uiohook-input-logger.adapter';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { mkdir: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('node:crypto', () => ({ randomUUID: () => 'fixed-uuid' }));

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    // Simulate the worker's own SIGTERM handler: it exits 0, no signal.
    if (signal === 'SIGTERM') {
      this.exitCode = 0;
      this.emit('exit', 0, null);
    }
    return true;
  });
}

describe('UiohookInputLogger', () => {
  let child: FakeChild;

  beforeEach(() => {
    child = new FakeChild();
    vi.mocked(spawn).mockReset().mockReturnValue(child as never);
    vi.mocked(fs.mkdir).mockClear();
  });

  it('creates storageRoot/.tmp and spawns node -e with resolved module paths in env', async () => {
    const logger = new UiohookInputLogger('/resolved/uiohook.js');

    const { outputPath } = await logger.start({ captureRawKeys: false }, '/srv/MeetingAI');

    expect(outputPath).toBe(path.join('/srv/MeetingAI', '.tmp', 'input-fixed-uuid.jsonl'));
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('/srv/MeetingAI', '.tmp'), { recursive: true });

    const [command, args, spawnOptions] = vi.mocked(spawn).mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args?.[0]).toBe('-e');
    expect((spawnOptions as any).env).toMatchObject({
      MT_INPUT_LOG_PATH: outputPath,
      MT_CAPTURE_RAW_KEYS: '0',
      MT_UIOHOOK_PATH: '/resolved/uiohook.js',
    });
  });

  it('passes MT_CAPTURE_RAW_KEYS=1 when raw key capture is opted in', async () => {
    const logger = new UiohookInputLogger('/u');

    await logger.start({ captureRawKeys: true }, '/srv/MeetingAI');

    const [, , spawnOptions] = vi.mocked(spawn).mock.calls[0];
    expect((spawnOptions as any).env.MT_CAPTURE_RAW_KEYS).toBe('1');
  });

  it('sends SIGTERM on stop and reports crashed=false on a clean exit', async () => {
    const logger = new UiohookInputLogger('/u');
    const { handle } = await logger.start({ captureRawKeys: false }, '/srv/MeetingAI');

    const result = await handle.stop();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result).toEqual({ crashed: false });
  });

  it('reports crashed=true when the worker exits with a non-zero code', async () => {
    const logger = new UiohookInputLogger('/u');
    const { handle } = await logger.start({ captureRawKeys: false }, '/srv/MeetingAI');

    child.exitCode = 1;
    child.emit('exit', 1, null);
    child.signalCode = null;

    const result = await handle.stop();

    expect(result).toEqual({ crashed: true });
    // Already dead: stop() must not try to signal it again.
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('reports crashed=true when the worker dies from a native abort (signal, no code)', async () => {
    const logger = new UiohookInputLogger('/u');
    const { handle } = await logger.start({ captureRawKeys: false }, '/srv/MeetingAI');

    child.signalCode = 'SIGABRT';
    child.emit('exit', null, 'SIGABRT');

    const result = await handle.stop();

    expect(result).toEqual({ crashed: true });
    expect(child.kill).not.toHaveBeenCalled();
  });
});

it('returns control when the native worker ignores shutdown, including repeated stop calls', async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeChild(); child.kill.mockImplementation(() => true);
    vi.mocked(spawn).mockReturnValue(child as never);
    const { handle } = await new UiohookInputLogger('/u').start({ captureRawKeys: false }, '/tmp');
    let stopped = false;
    const result = handle.stop().then(value => { stopped = true; return value; });
    await vi.advanceTimersByTimeAsync(2500);
    expect(stopped).toBe(true);
    expect(await result).toEqual({ crashed: true });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(await handle.stop()).toEqual({ crashed: true });
  } finally { vi.useRealTimers(); }
});
it('handles spawn failure without waiting for an exit event that will never arrive', async () => {
  const child = new FakeChild(); vi.mocked(spawn).mockReturnValue(child as never);
  const { handle } = await new UiohookInputLogger('/u').start({ captureRawKeys: false }, '/tmp');
  child.emit('error', new Error('ENOENT'));
  expect(await handle.stop()).toEqual({ crashed: true });
});
