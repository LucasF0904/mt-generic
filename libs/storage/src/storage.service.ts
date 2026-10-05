import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { MachineConfig, MachinePreferences, MachineConfigRepository, MACHINE_CONFIG_REPOSITORY } from '@mt/domain';
import { DiskSpaceAdapter, DISK_SPACE_ADAPTER } from './disk-space.adapter';

export interface ObsConnection {
  url?: string;
  password?: string;
}

@Injectable()
export class StorageService {
  constructor(
    @Inject(DISK_SPACE_ADAPTER) private readonly diskSpace: DiskSpaceAdapter,
    @Inject(MACHINE_CONFIG_REPOSITORY) private readonly configRepo: MachineConfigRepository,
  ) {}

  async resolveStorageRoot(options: { force?: boolean } = {}): Promise<MachineConfig> {
    const cached = await this.configRepo.load();
    if (!options.force) {
      // A cached config whose directory no longer exists (e.g. a disconnected mapped drive)
      // is treated as a cache miss so we self-heal by re-scanning, instead of returning or
      // throwing on a storage root that's no longer reachable.
      if (cached && existsSync(cached.storageRoot)) {
        return cached;
      }
    }

    const candidates = await this.diskSpace.listCandidates();
    if (candidates.length === 0) {
      throw new Error('No disk candidates found to resolve storage root');
    }

    const best = candidates.reduce((max, candidate) => (candidate.freeBytes > max.freeBytes ? candidate : max));
    const storageRoot = path.join(best.path, 'MeetingAI');
    await fs.mkdir(storageRoot, { recursive: true });

    const config = new MachineConfig(storageRoot, new Date(), cached?.obsUrl, cached?.obsPassword, cached?.preferences);
    await this.configRepo.save(config);
    return config;
  }

  layout(config: MachineConfig): { config: string; recordings: string; models: string; reports: string } {
    return {
      config: config.preferences.paths?.config ?? path.join(config.storageRoot, 'config'),
      recordings: config.preferences.paths?.recordings ?? config.storageRoot,
      models: config.preferences.paths?.models ?? path.join(config.storageRoot, 'models'),
      reports: config.preferences.paths?.reports ?? path.join(config.storageRoot, 'Processed', 'notes'),
    };
  }

  async updatePreferences(config: MachineConfig, preferences: Partial<MachinePreferences>): Promise<MachineConfig> {
    const merged = { ...config.preferences, ...preferences,
      paths: { ...config.preferences.paths, ...preferences.paths },
      profileVaults: { ...config.preferences.profileVaults, ...preferences.profileVaults },
    };
    const updated = new MachineConfig(config.storageRoot, config.resolvedAt, config.obsUrl, config.obsPassword, merged);
    for (const directory of Object.values(this.layout(updated))) await fs.mkdir(directory, { recursive: true });
    await this.configRepo.save(updated);
    return updated;
  }

  async selectStorageRoot(directory: string, migrate = false): Promise<MachineConfig> {
    const destination = path.resolve(directory);
    let previous: MachineConfig | null;
    try { previous = await this.configRepo.load(); }
    catch (error) { if (migrate) throw error; previous = null; }
    if (previous?.storageRoot === destination) return previous;
    let preferences = previous?.preferences ?? {};
    if (migrate && previous) {
      const source = path.resolve(previous.storageRoot);
      const relative = path.relative(source, destination);
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('O novo local não pode ficar dentro do armazenamento atual.');
      }
      if (existsSync(destination) && (await fs.readdir(destination)).length > 0) throw new Error('Escolha uma pasta vazia para migrar os dados.');
      await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true });
      const rebase = (value: string): string => value === source || value.startsWith(source + path.sep)
        ? path.join(destination, path.relative(source, value)) : value;
      preferences = JSON.parse(JSON.stringify(preferences), (_key, value) => typeof value === 'string' ? rebase(value) : value);
      const recordingRoot = this.layout(new MachineConfig(destination, new Date(), undefined, undefined, preferences)).recordings;
      for (const category of ['Staging', 'Processed']) {
        let entries: string[];
        try { entries = await fs.readdir(path.join(recordingRoot, category)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        for (const entry of entries) {
          const file = path.join(recordingRoot, category, entry, 'session.json');
          try {
            const data = JSON.parse(await fs.readFile(file, 'utf8'), (_key, value) => typeof value === 'string' ? rebase(value) : value);
            await fs.writeFile(file, JSON.stringify(data, null, 2));
          } catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) continue; throw error; }
        }
      }
    }
    await fs.mkdir(destination, { recursive: true });
    const config = new MachineConfig(destination, new Date(), previous?.obsUrl, previous?.obsPassword, preferences);
    await this.configRepo.save(config);
    return config;
  }

  /**
   * MT_OBS_URL/MT_OBS_PASSWORD (when set) always win, as an explicit
   * per-run override; otherwise falls back to whatever `mt setup` last
   * cached, so a fresh terminal doesn't need those exported to talk to an
   * OBS instance with WebSocket auth enabled (the OBS 28+ default).
   */
  resolveObsConnection(config: MachineConfig): ObsConnection {
    return {
      url: process.env.MT_OBS_URL ?? config.obsUrl,
      password: process.env.MT_OBS_PASSWORD ?? config.obsPassword,
    };
  }

  async saveObsConnection(config: MachineConfig, connection: ObsConnection): Promise<MachineConfig> {
    const updated = new MachineConfig(config.storageRoot, config.resolvedAt, connection.url, connection.password, config.preferences);
    await this.configRepo.save(updated);
    return updated;
  }
}
