import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceDiscoveryService } from './workspace-discovery.service';

const testHome = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async original => ({ ...await original<typeof import('node:os')>(), homedir: () => testHome.value }));

describe('workspace discovery', () => {
  it('allows first use without Obsidian and ignores corrupt or empty vault registries', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mt-vault-first-use-')); testHome.value = home;
    try {
      const discovery = new WorkspaceDiscoveryService('macos');
      expect(await discovery.listVaults()).toEqual([]);
      expect(await discovery.isVault(home)).toBe(false);
      const directory = join(home, 'Library/Application Support/obsidian');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'obsidian.json'), '{broken');
      expect(await discovery.listVaults()).toEqual([]);
      await writeFile(join(directory, 'obsidian.json'), '{}');
      expect(await discovery.listVaults()).toEqual([]);
    } finally { await rm(home, { recursive: true, force: true }); }
  });
  it('discovers registered vaults that still exist and can create a local vault without overwriting files', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mt-vaults-')); testHome.value = home;
    try {
      const vault = join(home, 'Work'); await mkdir(vault);
      const config = join(home, 'Library/Application Support/obsidian'); await mkdir(config, { recursive: true });
      await writeFile(join(config, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: vault }, b: { path: join(home, 'missing') } } }));
      const discovery = new WorkspaceDiscoveryService('macos');
      expect(await discovery.listVaults()).toEqual([{ name: 'Work', path: vault }]);
      await writeFile(join(vault, 'README.md'), 'existing');
      await discovery.createVault(vault);
      expect(await readFile(join(vault, 'README.md'), 'utf8')).toBe('existing');
      expect(await discovery.isVault(vault)).toBe(true);
    } finally { await rm(home, { recursive: true, force: true }); }
  });
});
