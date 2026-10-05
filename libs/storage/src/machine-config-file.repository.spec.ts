import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MachineConfig } from '@mt/domain';
const testHome = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => testHome.value }));

import { MachineConfigFileRepository } from './machine-config-file.repository';

let home: string;
let repo: MachineConfigFileRepository;
beforeEach(async () => { home = await fs.mkdtemp(join(tmpdir(), 'mt-config-')); testHome.value = home; repo = new MachineConfigFileRepository(home); });
afterEach(async () => { await fs.rm(home, { recursive: true, force: true }); });

describe('MachineConfigFileRepository', () => {
  it('returns null before first setup', async () => { expect(await repo.load()).toBeNull(); });

  it('keeps complete settings on the selected disk and only a locator at home', async () => {
    const root = join(home, 'external');
    const config = new MachineConfig(root, new Date(), 'ws://host:4455', 'secret', { defaultProfile: 'Work', initialized: true });
    await repo.save(config);
    const locator = JSON.parse(await fs.readFile(join(home, '.mt/machine-config.json'), 'utf8'));
    expect(locator).toEqual({ configPath: join(root, 'config/machine-config.json'), storageRoot: root });
    expect(JSON.stringify(locator)).not.toContain('secret');
    const saved = await repo.load();
    expect(saved?.obsPassword).toBe('secret');
    expect(saved?.preferences.defaultProfile).toBe('Work');
  });

  it('still loads the legacy home config and migrates it on save', async () => {
    await fs.mkdir(join(home, '.mt'));
    const legacy = { storageRoot: join(home, 'data'), resolvedAt: '2026-08-26T10:00:00.000Z', obsPassword: 'old' };
    await fs.writeFile(join(home, '.mt/machine-config.json'), JSON.stringify(legacy));
    const config = await repo.load();
    expect(config?.obsPassword).toBe('old');
    expect(config?.preferences).toEqual({});
    await repo.save(config!);
    expect((await repo.load())?.storageRoot).toBe(legacy.storageRoot);
  });

  it('supports a separate configuration directory', async () => {
    const configDir = join(home, 'custom-config');
    await repo.save(new MachineConfig(join(home, 'data'), new Date(), undefined, undefined, { paths: { config: configDir } }));
    expect(JSON.parse(await fs.readFile(join(home, '.mt/machine-config.json'), 'utf8')).configPath).toBe(join(configDir, 'machine-config.json'));
  });

  it('does not silently reset configuration when its external disk is unavailable', async () => {
    await fs.mkdir(join(home, '.mt'));
    await fs.writeFile(join(home, '.mt/machine-config.json'), JSON.stringify({ configPath: join(home, 'missing/config.json'), storageRoot: '/missing' }));
    await expect(repo.load()).rejects.toThrow(/armazenamento/);
  });

  it('reports corrupt settings instead of overwriting them', async () => {
    await fs.mkdir(join(home, '.mt'));
    await fs.writeFile(join(home, '.mt/machine-config.json'), '{bad');
    await expect(repo.load()).rejects.toThrow();
  });
});
