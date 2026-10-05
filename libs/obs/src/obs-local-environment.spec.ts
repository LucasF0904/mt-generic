import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObsLocalEnvironment } from './obs-local-environment';

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile, spawn: vi.fn() }));

describe('ObsLocalEnvironment', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reads local OBS credentials and port without saving a duplicate password', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    try {
      await mkdir(join(dir, 'plugin_config/obs-websocket'), { recursive: true });
      await writeFile(join(dir, 'plugin_config/obs-websocket/config.json'), JSON.stringify({ server_port: 4456, server_password: 'local-secret', auth_required: true }));
      const env = new ObsLocalEnvironment('macos', dir);
      expect(await env.resolveConnection()).toEqual({ url: 'ws://127.0.0.1:4456', password: 'local-secret' });
      expect(await env.resolveConnection('ws://example.test:4455')).toEqual({ url: 'ws://example.test:4455', password: undefined });
      expect(await env.resolveConnection('ws://127.0.0.1:9999')).toEqual({ url: 'ws://127.0.0.1:9999', password: undefined });
      expect(await env.resolveConnection(undefined, 'override')).toEqual({ url: 'ws://127.0.0.1:4456', password: 'override' });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('enables WebSocket only with OBS closed, preserving other settings and authentication', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    try {
      await mkdir(join(dir, 'plugin_config/obs-websocket'), { recursive: true });
      const file = join(dir, 'plugin_config/obs-websocket/config.json');
      await writeFile(file, JSON.stringify({ server_enabled: false, auth_required: true, server_password: 'keep', server_port: 4455, alerts_enabled: true }));
      execFile.mockImplementation((_file: string, _args: string[], optionsOrCallback: any, callback?: any) => {
        const cb = callback ?? optionsOrCallback;
        cb(_file === '/usr/bin/pgrep' ? Object.assign(new Error('not running'), { code: 1 }) : null, '', '');
      });
      await new ObsLocalEnvironment('macos', dir).ensureRunning('ws://127.0.0.1:4455');
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ server_enabled: true, auth_required: true, server_password: 'keep', alerts_enabled: true });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('does not overwrite config while OBS is open', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    try {
      await mkdir(join(dir, 'plugin_config/obs-websocket'), { recursive: true });
      const file = join(dir, 'plugin_config/obs-websocket/config.json');
      const original = JSON.stringify({ server_enabled: false });
      await writeFile(file, original);
      execFile.mockImplementation((_file: string, _args: string[], optionsOrCallback: any, callback?: any) => (callback ?? optionsOrCallback)(null, '1234', ''));
      await expect(new ObsLocalEnvironment('macos', dir).ensureRunning('ws://127.0.0.1:4455')).rejects.toThrow(/WebSocket/);
      expect(await readFile(file, 'utf8')).toBe(original);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('parses native monitor UUIDs and rejects missing capture IDs', async () => {
    execFile.mockImplementationOnce((_file: string, _args: string[], _options: any, cb: any) => cb(null, '[{"monitorIndex":0,"monitorName":"Dell","captureId":"UUID-A"}]', ''));
    expect(await new ObsLocalEnvironment('macos').listMacMonitors()).toEqual([{ monitorIndex: 0, monitorName: 'Dell', captureId: 'UUID-A' }]);
    execFile.mockImplementationOnce((_file: string, _args: string[], _options: any, cb: any) => cb(null, '[{"monitorIndex":0,"monitorName":"Dell"}]', ''));
    await expect(new ObsLocalEnvironment('macos').listMacMonitors()).rejects.toThrow(/UUID/);
  });

  it('provisions fresh authenticated settings when no OBS config exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    try {
      execFile.mockImplementation((_file: string, _args: string[], _options: any, cb: any) => cb(_file === '/usr/bin/pgrep' ? Object.assign(new Error('not running'), { code: 1 }) : null, '', ''));
      const env = new ObsLocalEnvironment('macos', dir);
      await env.ensureRunning('ws://127.0.0.1:4455');
      const config = JSON.parse(await readFile(join(dir, 'plugin_config/obs-websocket/config.json'), 'utf8'));
      expect(config).toMatchObject({ server_enabled: true, auth_required: true, server_port: 4455 });
      expect(config.server_password).toMatch(/^[0-9a-f]{48}$/);
      expect(await env.resolveConnection()).toEqual({ url: 'ws://127.0.0.1:4455', password: config.server_password });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('does not change a saved port to match a stale explicit URL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    try {
      await mkdir(join(dir, 'plugin_config/obs-websocket'), { recursive: true });
      const file = join(dir, 'plugin_config/obs-websocket/config.json');
      await writeFile(file, '{"server_port":4456}');
      execFile.mockImplementation((_file: string, _args: string[], _options: any, cb: any) => cb(Object.assign(new Error('not running'), { code: 1 }), '', ''));
      await expect(new ObsLocalEnvironment('macos', dir).ensureRunning('ws://127.0.0.1:4455')).rejects.toThrow(/porta/);
      expect(await readFile(file, 'utf8')).toBe('{"server_port":4456}');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('launches Windows OBS from its executable directory and provisions local auth', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-obs-'));
    const previous = process.env.MT_OBS_EXECUTABLE;
    try {
      const executable = join(dir, 'obs64.exe');
      await writeFile(executable, 'fixture');
      process.env.MT_OBS_EXECUTABLE = executable;
      execFile.mockImplementation((_file: string, _args: string[], _options: any, cb: any) => cb(null, 'INFO: No tasks are running', ''));
      const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
      vi.mocked(spawn).mockImplementation(() => { queueMicrotask(() => child.emit('spawn')); return child as any; });
      await new ObsLocalEnvironment('windows', dir).ensureRunning('ws://127.0.0.1:4455');
      expect(spawn).toHaveBeenCalledWith(executable, [], { cwd: dir, detached: true, stdio: 'ignore' });
      expect(JSON.parse(await readFile(join(dir, 'plugin_config/obs-websocket/config.json'), 'utf8'))).toMatchObject({ auth_required: true, server_enabled: true });
    } finally {
      if (previous === undefined) delete process.env.MT_OBS_EXECUTABLE; else process.env.MT_OBS_EXECUTABLE = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('never launches or provisions local OBS for a remote URL', async () => {
    await expect(new ObsLocalEnvironment('macos').ensureRunning('ws://remote.test:4455')).rejects.toThrow(/remoto/);
    expect(execFile).not.toHaveBeenCalled();
  });
});
