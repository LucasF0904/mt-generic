import { Inject, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { CURRENT_PLATFORM, SupportedPlatform } from '@mt/platform';

export interface VaultLocation { name: string; path: string }

@Injectable()
export class WorkspaceDiscoveryService {
  constructor(@Inject(CURRENT_PLATFORM) private readonly platform: SupportedPlatform) {}

  isInstalled(application: 'OBS' | 'Obsidian'): boolean {
    const candidates = this.platform === 'macos'
      ? [path.join('/Applications', `${application}.app`), path.join(homedir(), 'Applications', `${application}.app`)]
      : application === 'OBS'
        ? [process.env.MT_OBS_EXECUTABLE, path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'obs-studio/bin/64bit/obs64.exe')]
        : [path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData/Local'), 'Obsidian/Obsidian.exe'), path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Obsidian/Obsidian.exe')];
    return candidates.some(candidate => candidate && existsSync(candidate));
  }

  async listVaults(): Promise<VaultLocation[]> {
    const directory = this.platform === 'macos'
      ? path.join(homedir(), 'Library/Application Support/obsidian')
      : path.join(process.env.APPDATA ?? path.join(homedir(), 'AppData/Roaming'), 'obsidian');
    try {
      const config = JSON.parse(await fs.readFile(path.join(directory, 'obsidian.json'), 'utf8')) as { vaults?: Record<string, { path?: string }> };
      return [...new Set(Object.values(config.vaults ?? {}).map(vault => vault.path).filter((value): value is string => typeof value === 'string' && existsSync(value)))]
        .map(directory => ({ name: path.basename(directory), path: directory }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return [];
      throw error;
    }
  }

  async isVault(directory: string): Promise<boolean> {
    try { return (await fs.stat(path.join(directory, '.obsidian'))).isDirectory(); }
    catch { return false; }
  }

  async createVault(directory: string): Promise<string> {
    const resolved = path.resolve(directory);
    await fs.mkdir(path.join(resolved, '.obsidian'), { recursive: true });
    try { await fs.writeFile(path.join(resolved, 'README.md'), '# Reuniões\n\nVault local de gravações e relatórios do mt.\n', { flag: 'wx' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return resolved;
  }
}
