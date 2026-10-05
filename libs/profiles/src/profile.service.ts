import { Inject, Injectable } from '@nestjs/common';
import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';
import { Profile, ProfileRepository, PROFILE_REPOSITORY } from '@mt/domain';
import { StorageService } from '@mt/storage';

export const GENERIC_PROFILE = 'Sem perfil';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepository,
    private readonly storage: StorageService,
  ) {}

  async listAvailableProfiles(): Promise<Profile[]> {
    const config = await this.storage.resolveStorageRoot();
    const profiles = await this.repository.listAvailableProfiles([path.join(this.storage.layout(config).config, 'profiles')]);
    return profiles.map(profile => {
      const override = config.preferences.profileVaults?.[profile.name];
      if (override === '') return new Profile(profile.name, undefined, profile.notesFolder, profile.memoryFile);
      return override && existsSync(override)
        ? new Profile(profile.name, override, profile.notesFolder, profile.memoryFile) : profile;
    });
  }

  async createProfile(name: string, vaultDirectory?: string): Promise<Profile> {
    const cleanName = name.trim();
    if (!cleanName || /[\r\n]/.test(cleanName)) throw new Error('Informe um nome de perfil em uma única linha.');
    if ((await this.listAvailableProfiles()).some(profile => profile.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      throw new Error('Já existe um perfil com esse nome.');
    }
    const config = await this.storage.resolveStorageRoot();
    const directory = path.join(this.storage.layout(config).config, 'profiles');
    await fs.mkdir(directory, { recursive: true });
    const slug = cleanName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    if (!slug) throw new Error('O nome precisa conter pelo menos uma letra ou número.');
    await fs.writeFile(path.join(directory, `${slug}.md`), `# Perfil: ${cleanName}\n\n${vaultDirectory ? `Vault: \`${vaultDirectory}\`\n` : 'Perfil local do mt.\n'}`, { flag: 'wx' });
    return new Profile(cleanName, vaultDirectory);
  }
}
