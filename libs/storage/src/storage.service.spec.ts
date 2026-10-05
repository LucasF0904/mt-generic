import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { StorageService } from './storage.service';
import { DiskSpaceAdapter } from './disk-space.adapter';
import { MachineConfig, MachineConfigRepository } from '@mt/domain';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  promises: { mkdir: vi.fn().mockResolvedValue(undefined) },
}));

describe('StorageService', () => {
  let diskSpace: DiskSpaceAdapter;
  let configRepo: MachineConfigRepository;
  let service: StorageService;

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockClear();
    vi.mocked(existsSync).mockReset().mockReturnValue(true);
    diskSpace = { listCandidates: vi.fn() };
    configRepo = { load: vi.fn(), save: vi.fn() };
    service = new StorageService(diskSpace, configRepo);
  });

  it('reuses the cached machine config when one exists, its directory still exists, and force is not set', async () => {
    const cached = new MachineConfig('Z:\\MeetingAI', new Date('2026-08-20T00:00:00Z'));
    vi.mocked(configRepo.load).mockResolvedValue(cached);

    const result = await service.resolveStorageRoot();

    expect(result).toBe(cached);
    expect(existsSync).toHaveBeenCalledWith('Z:\\MeetingAI');
    expect(diskSpace.listCandidates).not.toHaveBeenCalled();
  });

  it('treats a cached config whose directory no longer exists as a cache miss and re-scans', async () => {
    const cached = new MachineConfig('Z:\\MeetingAI', new Date('2026-08-20T00:00:00Z'));
    vi.mocked(configRepo.load).mockResolvedValue(cached);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(diskSpace.listCandidates).mockResolvedValue([{ path: 'C:\\', freeBytes: 50_000_000_000 }]);

    const result = await service.resolveStorageRoot();

    expect(existsSync).toHaveBeenCalledWith('Z:\\MeetingAI');
    expect(diskSpace.listCandidates).toHaveBeenCalled();
    expect(result.storageRoot).toBe(path.join('C:\\', 'MeetingAI'));
    expect(result).not.toBe(cached);
    expect(configRepo.save).toHaveBeenCalledWith(result);
  });

  it('picks the disk with the most free space when no cache exists', async () => {
    vi.mocked(configRepo.load).mockResolvedValue(null);
    vi.mocked(diskSpace.listCandidates).mockResolvedValue([
      { path: 'C:\\', freeBytes: 50_000_000_000 },
      { path: 'Z:\\', freeBytes: 900_000_000_000 },
      { path: 'D:\\', freeBytes: 200_000_000_000 },
    ]);

    const result = await service.resolveStorageRoot();

    expect(result.storageRoot).toBe(path.join('Z:\\', 'MeetingAI'));
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('Z:\\', 'MeetingAI'), { recursive: true });
    expect(configRepo.save).toHaveBeenCalledWith(result);
  });

  it('re-scans disks when force is true, even if a cache exists', async () => {
    const cached = new MachineConfig('C:\\MeetingAI', new Date('2026-01-01T00:00:00Z'));
    vi.mocked(configRepo.load).mockResolvedValue(cached);
    vi.mocked(diskSpace.listCandidates).mockResolvedValue([
      { path: 'Z:\\', freeBytes: 900_000_000_000 },
    ]);

    const result = await service.resolveStorageRoot({ force: true });

    expect(result.storageRoot).toBe(path.join('Z:\\', 'MeetingAI'));
    expect(diskSpace.listCandidates).toHaveBeenCalled();
  });

  it('throws when there are no disk candidates at all', async () => {
    vi.mocked(configRepo.load).mockResolvedValue(null);
    vi.mocked(diskSpace.listCandidates).mockResolvedValue([]);

    await expect(service.resolveStorageRoot()).rejects.toThrow(
      'No disk candidates found to resolve storage root',
    );
  });

  describe('resolveObsConnection', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('falls back to the cached config when no env vars are set', () => {
      delete process.env.MT_OBS_URL;
      delete process.env.MT_OBS_PASSWORD;
      const config = new MachineConfig('Z:\\MeetingAI', new Date(), 'ws://cached:4455', 'cached-pw');

      expect(service.resolveObsConnection(config)).toEqual({ url: 'ws://cached:4455', password: 'cached-pw' });
    });

    it('lets MT_OBS_URL/MT_OBS_PASSWORD override the cached config', () => {
      process.env.MT_OBS_URL = 'ws://override:4455';
      process.env.MT_OBS_PASSWORD = 'override-pw';
      const config = new MachineConfig('Z:\\MeetingAI', new Date(), 'ws://cached:4455', 'cached-pw');

      expect(service.resolveObsConnection(config)).toEqual({ url: 'ws://override:4455', password: 'override-pw' });
    });

    it('returns undefined for both when neither env nor cache has them', () => {
      delete process.env.MT_OBS_URL;
      delete process.env.MT_OBS_PASSWORD;
      const config = new MachineConfig('Z:\\MeetingAI', new Date());

      expect(service.resolveObsConnection(config)).toEqual({ url: undefined, password: undefined });
    });
  });

  describe('saveObsConnection', () => {
    it('persists a new MachineConfig with the OBS connection, keeping storageRoot/resolvedAt', async () => {
      const resolvedAt = new Date('2026-08-20T00:00:00Z');
      const config = new MachineConfig('Z:\\MeetingAI', resolvedAt);

      const updated = await service.saveObsConnection(config, { url: 'ws://127.0.0.1:4455', password: 'secret' });

      expect(updated.storageRoot).toBe('Z:\\MeetingAI');
      expect(updated.resolvedAt).toBe(resolvedAt);
      expect(updated.obsUrl).toBe('ws://127.0.0.1:4455');
      expect(updated.obsPassword).toBe('secret');
      expect(configRepo.save).toHaveBeenCalledWith(updated);
    });
  });
});
