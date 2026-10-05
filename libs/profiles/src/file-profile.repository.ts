import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Profile, ProfileRepository } from '@mt/domain';

const HEADING_PATTERN = /^#\s*Perfil:\s*(.+)$/m;
const DIRECTORY_PATTERN = /(?:Diret[oó]rio(?:\s+local)?|Vault):\s*`([^`]+)`/;
const MEMORY_PATTERN = /`([^`]*[\\/]memory\.jsonl)`/;

export class FileProfileRepository implements ProfileRepository {
  private readonly directories: string[];

  constructor(directories?: string[]) {
    this.directories = directories ?? [];
  }

  async listAvailableProfiles(additionalDirectories: string[] = []): Promise<Profile[]> {
    const profiles = new Map<string, Profile>();
    for (const directory of [...additionalDirectories, ...this.directories]) {
      let files: string[];
      try { files = (await fs.readdir(directory)).filter(file => file.endsWith('.md')).sort(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (const file of files) {
        let content: string;
        try { content = await fs.readFile(path.join(directory, file), 'utf8'); }
        catch { continue; }
        const name = HEADING_PATTERN.exec(content)?.[1].trim() ?? path.basename(file, '.md');
        const key = name.toLocaleLowerCase();
        if (profiles.has(key)) continue;
        const rawGraph = MEMORY_PATTERN.exec(content)?.[1];
        const memoryFile = rawGraph ? this.existingPath(rawGraph, directory) : undefined;
        const rawVault = DIRECTORY_PATTERN.exec(content)?.[1];
        const vault = rawVault ? this.existingPath(rawVault, directory) : memoryFile ? path.dirname(memoryFile) : undefined;
        profiles.set(key, new Profile(name, vault, 'Meetings', memoryFile));
      }
    }
    return [...profiles.values()];
  }

  private existingPath(candidate: string, profileDirectory: string): string | undefined {
    const expanded = candidate.startsWith('~/') ? path.join(os.homedir(), candidate.slice(2)) : candidate;
    if (path.isAbsolute(expanded) || path.win32.isAbsolute(expanded)) return existsSync(expanded) ? path.normalize(expanded) : undefined;
    const relativeToProfile = path.resolve(profileDirectory, expanded);
    return existsSync(relativeToProfile) ? relativeToProfile : undefined;
  }
}
