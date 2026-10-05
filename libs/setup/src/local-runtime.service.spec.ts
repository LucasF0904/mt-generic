import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { it, expect, vi } from 'vitest';
import { MachineConfig } from '@mt/domain';
import { LocalRuntimeService } from './local-runtime.service';
it('reuses legacy whisper assets but starts Ollama on the explicitly selected model disk', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-runtime-test-'));
  const saved = { ...process.env };
  try {
    await fs.mkdir(path.join(directory, 'bin/models'), { recursive: true });
    await fs.writeFile(path.join(directory, 'bin/whisper-cli'), 'binary');
    await fs.writeFile(path.join(directory, 'bin/models/ggml-medium.bin'), 'model');
    const config = new MachineConfig(directory, new Date(), undefined, undefined, { paths: { models: path.join(directory, 'custom') } });
    const env = { checkFfmpeg: async () => true, checkOllama: async () => true, pullOllamaModels: vi.fn() };
    const ollama = { start: vi.fn().mockResolvedValue('http://127.0.0.1:12345'), onModuleDestroy: vi.fn() };
    const storage = { layout: () => ({ models: path.join(directory, 'custom') }) };
    const service = new LocalRuntimeService(env as any, ollama as any, storage as any, { run: vi.fn() } as any, 'macos');
    // A custom models root must not silently reuse a model on another disk.
    await expect(service.prepare(config)).rejects.toThrow('modelo');
    await fs.mkdir(path.join(directory, 'custom/whisper'), { recursive: true });
    await fs.writeFile(path.join(directory, 'custom/whisper/ggml-medium.bin'), 'model');
    await service.prepare(config);
    expect(process.env.MT_WHISPER_MODEL_PATH).toBe(path.join(directory, 'custom/whisper/ggml-medium.bin'));
    expect(ollama.start).toHaveBeenCalledWith(path.join(directory, 'custom/ollama'));
    expect(env.pullOllamaModels).not.toHaveBeenCalled();
    service.reset();
    expect(ollama.onModuleDestroy).toHaveBeenCalledOnce();
    expect(process.env.MT_WHISPER_MODEL_PATH).toBe(saved.MT_WHISPER_MODEL_PATH);
    // Preparing again after settings must use the new paths, not inherited defaults.
    const replacement = path.join(directory, 'replacement.bin');
    await fs.writeFile(replacement, 'new model');
    const changed = new MachineConfig(directory, new Date(), undefined, undefined, { whisperModel: replacement });
    await service.prepare(changed, { audioOnly: true });
    expect(process.env.MT_WHISPER_MODEL_PATH).toBe(saved.MT_WHISPER_MODEL_PATH ?? replacement);
    service.reset();
  } finally { process.env = saved; await fs.rm(directory, { recursive: true, force: true }); }
});

it('supports audio-only, preserves explicit overrides and reports optional Ollama failures', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-runtime-cases-'));
  const saved = { ...process.env };
  try {
    const model = path.join(directory, 'model.bin'); await fs.writeFile(model, 'fixture');
    process.env.MT_WHISPER_BINARY = '/explicit/whisper';
    process.env.MT_WHISPER_MODEL_PATH = model;
    const env = { checkFfmpeg: vi.fn().mockResolvedValue(true), checkOllama: vi.fn().mockResolvedValue(false), pullOllamaModels: vi.fn() };
    const ollama = { start: vi.fn().mockRejectedValue(new Error('offline')) };
    const config = new MachineConfig(directory, new Date());
    const service = new LocalRuntimeService(env as any, ollama as any, { layout: () => ({ models: directory }) } as any, {} as any, 'macos');
    expect(await service.prepare(config, { audioOnly: true })).toEqual([]);
    expect(env.checkOllama).not.toHaveBeenCalled();
    expect((await service.prepare(config)).join()).toContain('Ollama ausente');
    await expect(service.prepare(config, { download: true })).rejects.toThrow('Ollama ausente');
    env.checkOllama.mockResolvedValue(true);
    expect((await service.prepare(config)).join()).toContain('offline');
    await fs.mkdir(path.join(directory, 'ollama-models'));
    await service.prepare(config, { download: true });
    expect(env.pullOllamaModels).toHaveBeenCalledWith(['llama3.2:3b', 'qwen2.5vl'], directory, path.join(directory, 'ollama-models'));
    service.onModuleDestroy();
    expect(process.env.MT_WHISPER_BINARY).toBe('/explicit/whisper');
    env.checkFfmpeg.mockResolvedValue(false);
    await expect(service.prepare(config)).rejects.toThrow('FFmpeg ausente');
  } finally { process.env = saved; await fs.rm(directory, { recursive: true, force: true }); }
});

it('rejects truncated/model downloads and removes partial files without changing the model destination', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-download-'));
  const saved = { ...process.env };
  try {
    delete process.env.MT_WHISPER_MODEL_PATH; delete process.env.MT_WHISPER_MODEL;
    const config = new MachineConfig(directory, new Date(), undefined, undefined, { whisperBinary: '/whisper', whisperModel: path.join(directory, 'model.bin') });
    const service = new LocalRuntimeService({ checkFfmpeg: async () => true } as any, {} as any, { layout: () => ({ models: directory }) } as any, {} as any, 'macos');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('incomplete model')));
    await expect(service.prepare(config, { download: true, audioOnly: true })).rejects.toThrow('SHA256');
    expect(await fs.readdir(directory)).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(service.prepare(config, { download: true })).rejects.toThrow('HTTP 404');
    process.env.MT_WHISPER_MODEL = 'custom.bin';
    await expect(service.prepare(config, { download: true })).rejects.toThrow('personalizado');
    expect(await fs.readdir(directory)).toEqual([]);
  } finally { vi.unstubAllGlobals(); process.env = saved; await fs.rm(directory, { recursive: true, force: true }); }
});

it.each(['macos', 'windows'] as const)('installs only missing packages with argument-safe commands on %s', async platform => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-install-'));
  const saved = { ...process.env };
  try {
    for (const key of ['MT_WHISPER_BINARY', 'MT_WHISPER_MODEL_PATH']) delete process.env[key];
    const binary = path.join(directory, 'whisper'); const model = path.join(directory, 'model.bin');
    await fs.writeFile(binary, 'fixture'); await fs.writeFile(model, 'fixture');
    const config = new MachineConfig(directory, new Date(), undefined, undefined, { whisperBinary: binary, whisperModel: model });
    let installed = false;
    const env = { checkFfmpeg: async () => installed, checkOllama: async () => installed };
    const runner = { run: vi.fn(async () => { installed = true; return { exitCode: 0 }; }) };
    const service = new LocalRuntimeService(env as any, { start: async () => 'http://127.0.0.1:1' } as any, { layout: () => ({ models: directory }), resolveStorageRoot: async () => config } as any, runner as any, platform);
    await service.prepare(config, { installTools: true });
    expect(runner.run).toHaveBeenCalledWith(platform === 'macos' ? 'brew' : 'winget', platform === 'macos' ? ['install', 'ffmpeg'] : ['install', '--id', 'Gyan.FFmpeg', '--exact', '--accept-package-agreements', '--accept-source-agreements']);
    service.onModuleDestroy();
    installed = false; runner.run.mockRejectedValueOnce(new Error('package manager absent'));
    await expect(service.prepare(config, { installTools: true })).rejects.toThrow('package manager absent');
  } finally { process.env = saved; await fs.rm(directory, { recursive: true, force: true }); }
});
