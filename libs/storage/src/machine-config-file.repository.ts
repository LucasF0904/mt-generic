import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { MachineConfig, MachineConfigRepository, MachinePreferences } from '@mt/domain';

interface MachineConfigJson {
  storageRoot: string;
  resolvedAt: string;
  obsUrl?: string;
  obsPassword?: string;
  preferences?: MachinePreferences;
}

export class MachineConfigFileRepository implements MachineConfigRepository {
  private readonly locatorPath: string;

  constructor(home = homedir()) {
    this.locatorPath = path.join(home, '.mt', 'machine-config.json');
  }

  async load(): Promise<MachineConfig | null> {
    let document: MachineConfigJson & { configPath?: string };
    try { document = JSON.parse(await fs.readFile(this.locatorPath, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (document.configPath) {
      try { document = JSON.parse(await fs.readFile(document.configPath, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('O armazenamento configurado não está disponível. Conecte o disco ou escolha outro local em mt settings --storage-root <pasta>.', { cause: error });
        }
        throw error;
      }
    }
    return new MachineConfig(document.storageRoot, new Date(document.resolvedAt), document.obsUrl, document.obsPassword, document.preferences);
  }

  async save(config: MachineConfig): Promise<void> {
    const directory = config.preferences.paths?.config ?? path.join(config.storageRoot, 'config');
    const configPath = path.join(directory, 'machine-config.json');
    const json: MachineConfigJson = {
      storageRoot: config.storageRoot, resolvedAt: config.resolvedAt.toISOString(),
      obsUrl: config.obsUrl, obsPassword: config.obsPassword, preferences: config.preferences,
    };
    await this.atomicWrite(configPath, json);
    await this.atomicWrite(this.locatorPath, { configPath, storageRoot: config.storageRoot });
  }

  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, filePath);
    } finally { await fs.rm(temporary, { force: true }); }
  }
}
