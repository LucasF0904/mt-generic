import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { SupportedPlatform } from '@mt/platform';
import { EnvironmentSetupService } from './environment-setup.service';
import { ProcessRunner } from './process-runner';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('EnvironmentSetupService', () => {
  afterEach(() => vi.unstubAllGlobals());
  let runner: ProcessRunner;
  let service: EnvironmentSetupService;
  const makeService = (platform: SupportedPlatform = 'windows') => new EnvironmentSetupService(runner, platform, { start: async () => 'http://127.0.0.1:11435' } as any);

  beforeEach(() => {
    runner = { run: vi.fn() };
    service = makeService();
    vi.mocked(existsSync).mockReset();
    vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined as never);
  });

  it('reports ffmpeg present when the version command exits 0', async () => {
    vi.mocked(runner.run).mockResolvedValue({ exitCode: 0, stdout: 'ffmpeg version 7.0', stderr: '' });
    await expect(service.checkFfmpeg()).resolves.toBe(true);
    expect(runner.run).toHaveBeenCalledWith('ffmpeg', ['-version']);
  });

  it('reports ffmpeg absent when the command fails', async () => {
    vi.mocked(runner.run).mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not found' });
    await expect(service.checkFfmpeg()).resolves.toBe(false);
  });

  it('reports ollama present when the version command exits 0', async () => {
    vi.mocked(runner.run).mockResolvedValue({ exitCode: 0, stdout: 'ollama 0.5.1', stderr: '' });
    await expect(service.checkOllama()).resolves.toBe(true);
    expect(runner.run).toHaveBeenCalledWith('ollama', ['--version']);
  });

  it('looks for whisper-cli.exe under storageRoot/bin on Windows', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    await expect(makeService('windows').checkWhisperCpp('Z:\\MeetingAI')).resolves.toBe(true);
    expect(existsSync).toHaveBeenCalledWith(path.join('Z:\\MeetingAI', 'bin', 'whisper-cli.exe'));
  });

  it('looks for the extensionless whisper-cli under storageRoot/bin on macOS', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    await expect(makeService('macos').checkWhisperCpp('/Volumes/ExternalDisk/MeetingAI')).resolves.toBe(true);
    expect(existsSync).toHaveBeenCalledWith(path.join('/Volumes/ExternalDisk/MeetingAI', 'bin', 'whisper-cli'));
  });

  it('exposes the expected whisper.cpp path per platform', () => {
    expect(makeService('windows').whisperCliPath('Z:\\MeetingAI')).toBe(
      path.join('Z:\\MeetingAI', 'bin', 'whisper-cli.exe'),
    );
    expect(makeService('macos').whisperCliPath('/srv/MeetingAI')).toBe(
      path.join('/srv/MeetingAI', 'bin', 'whisper-cli'),
    );
  });

  it('reports whisper.cpp absent when the binary is missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(service.checkWhisperCpp('Z:\\MeetingAI')).resolves.toBe(false);
  });

  it('pulls each requested Ollama model through the managed server for the selected storage directory', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) });
    vi.stubGlobal('fetch', fetchMock);
    await service.pullOllamaModels(['llama3.2:3b', 'qwen2.5vl'], 'Z:\\MeetingAI');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:11435/api/pull', expect.objectContaining({ body: JSON.stringify({ model: 'llama3.2:3b', stream: false }) }));
  });

  it('throws with the model name when a pull fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'network error' }) }));

    await expect(service.pullOllamaModels(['llama3.2:3b'], 'Z:\\MeetingAI')).rejects.toThrow(
      'Failed to pull Ollama model "llama3.2:3b": network error',
    );
  });
});
