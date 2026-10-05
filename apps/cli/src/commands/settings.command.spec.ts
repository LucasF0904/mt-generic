import { describe, expect, it, vi } from 'vitest';
import { MachineConfig } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { ProfileService } from '@mt/profiles';
import { WorkspaceDiscoveryService } from '@mt/setup';
import * as p from '@clack/prompts';
import { SettingsCommand } from './settings.command';
vi.mock('@clack/prompts', () => ({ intro: vi.fn(), outro: vi.fn(), text: vi.fn(), select: vi.fn(), confirm: vi.fn(), isCancel: vi.fn(() => false), log: { info: vi.fn(), success: vi.fn() } }));

describe('settings command', () => {
  it('allows first use without a profile or vault', async () => {
    const config = new MachineConfig('/data', new Date());
    const save = vi.fn(async (_config, preferences) => new MachineConfig('/data', new Date(), undefined, undefined, preferences));
    const storage = { resolveStorageRoot: async () => config, updatePreferences: save, layout: () => ({ config: '/data/config' }) } as unknown as StorageService;
    const profiles = { listAvailableProfiles: async () => [], createProfile: vi.fn() } as unknown as ProfileService;
    const discovery = { listVaults: async () => [], createVault: vi.fn() } as unknown as WorkspaceDiscoveryService;
    vi.mocked(p.text).mockResolvedValue('/data'); vi.mocked(p.confirm).mockResolvedValue(false); vi.mocked(p.select).mockResolvedValue('generic');
    await new SettingsCommand(storage, profiles, discovery).run();
    expect(save).toHaveBeenCalledWith(config, expect.objectContaining({ initialized: true, defaultProfile: 'Sem perfil' }));
    expect(profiles.createProfile).not.toHaveBeenCalled();
    expect(discovery.createVault).not.toHaveBeenCalled();
  });
});
