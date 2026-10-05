import { describe, expect, it, vi } from 'vitest';
import { ProfileService } from './profile.service';
import { StorageService } from '@mt/storage';
import { Profile, ProfileRepository } from '@mt/domain';

describe('ProfileService', () => {
  it('returns whatever the repository returns', async () => {
    const repository: ProfileRepository = {
      listAvailableProfiles: vi.fn().mockResolvedValue([new Profile('Demo', 'Z:\\demo-docs')]),
    };
    const service = new ProfileService(repository, { resolveStorageRoot: async () => ({ preferences: {} }), layout: () => ({ config: '/config' }) } as unknown as StorageService);

    const profiles = await service.listAvailableProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Demo');
    expect(repository.listAvailableProfiles).toHaveBeenCalled();
  });
});
