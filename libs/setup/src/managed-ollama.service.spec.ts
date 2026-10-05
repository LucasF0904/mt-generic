import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { ManagedOllamaService } from './managed-ollama.service';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { mkdir: vi.fn() } }));
const previous = process.env.MT_OLLAMA_URL;
afterEach(() => { vi.unstubAllGlobals(); if (previous === undefined) delete process.env.MT_OLLAMA_URL; else process.env.MT_OLLAMA_URL = previous; });
it('launches only its own local server with the selected disk, reuses it and cleans it up', async () => {
  delete process.env.MT_OLLAMA_URL;
  const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn(), exitCode: null, signalCode: null });
  vi.mocked(spawn).mockReturnValue(child as any);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  const service = new ManagedOllamaService();
  const url = await service.start('/external/models');
  expect(new URL(url).hostname).toBe('127.0.0.1');
  expect(spawn).toHaveBeenCalledWith('ollama', ['serve'], expect.objectContaining({ env: expect.objectContaining({ OLLAMA_MODELS: '/external/models', OLLAMA_NO_CLOUD: '1' }) }));
  expect(await service.start('/external/models')).toBe(url);
  expect(spawn).toHaveBeenCalledTimes(1);
  service.onModuleDestroy(); expect(child.kill).toHaveBeenCalled();
  expect(process.env.MT_OLLAMA_URL).toBeUndefined();
});
it('respects an explicitly configured localhost server without starting or stopping another process', async () => {
  process.env.MT_OLLAMA_URL = 'http://localhost:11434';
  vi.mocked(spawn).mockClear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  const service = new ManagedOllamaService();
  expect(await service.start('/models')).toBe('http://localhost:11434');
  expect(spawn).not.toHaveBeenCalled(); service.onModuleDestroy();
  expect(process.env.MT_OLLAMA_URL).toBe('http://localhost:11434');
});
it('rejects a remote endpoint for local processing and an unavailable explicit server', async () => {
  process.env.MT_OLLAMA_URL = 'https://example.org';
  await expect(new ManagedOllamaService().start('/models')).rejects.toThrow('localhost');
  process.env.MT_OLLAMA_URL = 'http://localhost:11434';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(new ManagedOllamaService().start('/models')).rejects.toThrow('não está disponível');
});
