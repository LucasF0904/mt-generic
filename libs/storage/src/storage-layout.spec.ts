import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service';
const testHome = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => testHome.value }));

import { MachineConfigFileRepository } from './machine-config-file.repository';
import { MachineConfig } from '@mt/domain';

describe('portable storage', () => {
  it('uses explicit directories without losing OBS credentials or profile preferences', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mt-layout-'));
    try {
      testHome.value = home;
      const repo = new MachineConfigFileRepository(home);
      const service = new StorageService({ listCandidates: async () => [] }, repo);
      const config = new MachineConfig(join(home, 'data'), new Date(), 'ws://obs', 'secret', { defaultProfile: 'Work' });
      await repo.save(config);
      const updated = await service.updatePreferences(config, { paths: { models: join(home, 'models') } });
      expect(updated.preferences.defaultProfile).toBe('Work');
      expect(updated.obsPassword).toBe('secret');
      expect(service.layout(updated).models).toBe(join(home, 'models'));
      expect(service.layout(updated).recordings).toBe(config.storageRoot);
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  it('copies a workspace and rebases session paths while preserving the original', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mt-move-'));
    try {
      testHome.value = home;
      const repo = new MachineConfigFileRepository(home);
      const service = new StorageService({ listCandidates: async () => [] }, repo);
      const source = join(home, 'source'); const destination = join(home, 'destination');
      await mkdir(join(source, 'Staging/session'), { recursive: true });
      await writeFile(join(source, 'Staging/session/recording.mkv'), 'video');
      await writeFile(join(source, 'Staging/session/session.json'), JSON.stringify({ videoPath: join(source, 'Staging/session/recording.mkv') }));
      await repo.save(new MachineConfig(source, new Date(), undefined, undefined, { defaultProfile: 'Work' }));
      const moved = await service.selectStorageRoot(destination, true);
      expect(moved.preferences.defaultProfile).toBe('Work');
      expect(JSON.parse(await readFile(join(destination, 'Staging/session/session.json'), 'utf8')).videoPath).toBe(join(destination, 'Staging/session/recording.mkv'));
      expect(await readFile(join(source, 'Staging/session/recording.mkv'), 'utf8')).toBe('video');
      expect((await repo.load())?.storageRoot).toBe(destination);
      await expect(service.selectStorageRoot(join(destination, 'nested'), true)).rejects.toThrow();
    } finally { await rm(home, { recursive: true, force: true }); }
  });
});
