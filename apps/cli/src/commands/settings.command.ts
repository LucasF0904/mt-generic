import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { MachineConfig, MachinePreferences } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { ProfileService } from '@mt/profiles';
import { WorkspaceDiscoveryService } from '@mt/setup';

interface SettingsOptions {
  storageRoot?: string; migrate?: boolean; configRoot?: string; recordingsRoot?: string;
  modelsRoot?: string; reportsRoot?: string; profile?: string; createProfile?: string;
  vault?: string; createVault?: string; whisperBinary?: string; whisperModel?: string; summaryModel?: string; visionModel?: string;
}

@Injectable()
@Command({ name: 'settings', description: 'Escolhe armazenamento, perfil padrão e vault; permite mudar os locais depois' })
export class SettingsCommand extends CommandRunner {
  constructor(private readonly storage: StorageService, private readonly profiles: ProfileService, private readonly discovery: WorkspaceDiscoveryService) { super(); }

  async run(_params: string[] = [], options: SettingsOptions = {}): Promise<void> {
    p.intro('Configurações do mt');
    const interactive = Object.keys(options).length === 0;
    let config = options.storageRoot
      ? await this.storage.selectStorageRoot(this.directory(options.storageRoot), options.migrate)
      : await this.storage.resolveStorageRoot();
    if (interactive) {
      const directory = this.directory(await this.askText('Onde guardar configurações, gravações, transcrições e modelos?', config.storageRoot));
      if (directory !== config.storageRoot) {
        const migrate = this.answer(await p.confirm({ message: 'Copiar também os dados atuais para o novo local? A origem será preservada.', initialValue: true }));
        config = await this.storage.selectStorageRoot(directory, migrate);
      }
    }
    const preferences: Partial<MachinePreferences> = { initialized: true };
    for (const key of ['whisperBinary', 'whisperModel'] as const) if (options[key]) preferences[key] = this.directory(options[key]!);
    for (const key of ['summaryModel', 'visionModel'] as const) if (options[key]) preferences[key] = options[key];
    const paths: NonNullable<MachinePreferences['paths']> = {};
    for (const [key, value] of Object.entries({ config: options.configRoot, recordings: options.recordingsRoot, models: options.modelsRoot, reports: options.reportsRoot })) {
      if (value) paths[key as keyof typeof paths] = this.directory(value);
    }
    if (Object.keys(paths).length) {
      config = await this.storage.updatePreferences(config, { paths });
    }
    let available = await this.profiles.listAvailableProfiles();
    let profileName = options.profile ?? config.preferences.defaultProfile;
    if (options.createProfile) {
      const created = await this.profiles.createProfile(options.createProfile);
      profileName = created.name; available = [...available, created];
    } else if (interactive) {
      if (!available.length) {
        const create = this.answer(await p.confirm({ message: 'Nenhum perfil encontrado. Deseja criar um perfil local?', initialValue: false }));
        if (create) {
          const created = await this.profiles.createProfile(await this.askText('Nome do perfil:'));
          profileName = created.name; available = [created];
        } else profileName = 'Sem perfil';
      } else {
        profileName = this.answer(await p.select({ message: 'Perfil padrão:', initialValue: available.some(item => item.name === profileName) ? profileName : available[0].name,
          options: [...available.map(item => ({ value: item.name, label: item.name })), { value: 'Sem perfil', label: 'Sem perfil — arquivos genéricos' }],
        }));
      }
    }
    if (profileName && profileName !== 'Sem perfil' && !available.some(profile => profile.name === profileName)) throw new Error(`Perfil não encontrado: ${profileName}`);
    preferences.defaultProfile = profileName ?? 'Sem perfil';
    const profile = available.find(item => item.name === profileName);
    let vault = options.createVault ? await this.discovery.createVault(this.directory(options.createVault)) : options.vault ? this.directory(options.vault) : undefined;
    if (options.vault && !existsSync(vault!)) throw new Error('O vault informado não existe. Use --create-vault para criar um.');
    if (interactive) {
      const referenced = profile?.vaultDirectory ?? config.preferences.defaultVault;
      if (referenced && existsSync(referenced)) {
        const keep = this.answer(await p.confirm({ message: `Usar o destino já referenciado: ${referenced}?`, initialValue: true }));
        if (keep) vault = referenced;
      }
      if (!vault) vault = await this.chooseVault(config);
    }
    if (vault) {
      preferences.defaultVault = vault;
      if (profileName && profileName !== 'Sem perfil') preferences.profileVaults = { [profileName]: vault };
    } else if (interactive) {
      preferences.defaultVault = undefined;
      if (profileName && profileName !== 'Sem perfil') preferences.profileVaults = { [profileName]: '' };
    }
    config = await this.storage.updatePreferences(config, preferences);
    p.log.success(`Configurações: ${this.storage.layout(config).config}`);
    p.log.info(`Perfil padrão: ${config.preferences.defaultProfile}. Destino: ${vault ?? 'Markdown no armazenamento do mt'}.`);
    p.outro('Configurações salvas.');
  }

  private async chooseVault(config: MachineConfig): Promise<string | undefined> {
    const vaults = await this.discovery.listVaults();
    const selection = this.answer(await p.select({ message: 'Onde salvar a transcrição e o relatório?', options: [
      ...vaults.map(vault => ({ value: vault.path, label: `Vault: ${vault.name} — ${vault.path}` })),
      { value: 'generic', label: 'Arquivos genéricos no armazenamento do mt' },
      { value: 'create', label: 'Criar um vault local' },
      { value: 'path', label: 'Referenciar outra pasta/vault' },
    ] }));
    if (selection === 'generic') return undefined;
    if (selection === 'create') return this.discovery.createVault(this.directory(await this.askText('Pasta do novo vault:', path.join(config.storageRoot, 'Vault'))));
    if (selection === 'path') {
      const directory = this.directory(await this.askText('Pasta existente do vault:'));
      if (!existsSync(directory)) throw new Error('A pasta informada não existe.');
      return directory;
    }
    return selection;
  }

  private answer<T>(value: T | symbol): T {
    if (p.isCancel(value)) throw new Error('Configuração cancelada. Você pode retomá-la em settings.');
    return value as T;
  }

  private async askText(message: string, defaultValue?: string): Promise<string> {
    return this.answer(await p.text({ message, defaultValue, placeholder: defaultValue, validate: value => !value.trim() && !defaultValue ? 'Preencha este campo.' : undefined }));
  }

  private directory(value: string): string { return path.resolve(value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value); }

  @Option({ flags: '--whisper-binary <path>', description: 'Executável whisper-cli, preservando suas bibliotecas ao lado' }) parseWhisperBinary(value: string): string { return value; }
  @Option({ flags: '--whisper-model <path>', description: 'Arquivo do modelo whisper.cpp' }) parseWhisperModel(value: string): string { return value; }
  @Option({ flags: '--summary-model <name>', description: 'Modelo Ollama para resumo' }) parseSummaryModel(value: string): string { return value; }
  @Option({ flags: '--vision-model <name>', description: 'Modelo Ollama para frames' }) parseVisionModel(value: string): string { return value; }
  @Option({ flags: '--storage-root <path>', description: 'Diretório principal dos dados' }) parseStorage(value: string): string { return value; }
  @Option({ flags: '--migrate', description: 'Copia os dados atuais para o novo storage root, preservando a origem' }) parseMigrate(): boolean { return true; }
  @Option({ flags: '--config-root <path>', description: 'Diretório das configurações e perfis locais' }) parseConfig(value: string): string { return value; }
  @Option({ flags: '--recordings-root <path>', description: 'Diretório de gravações e sessões' }) parseRecordings(value: string): string { return value; }
  @Option({ flags: '--models-root <path>', description: 'Diretório de modelos locais' }) parseModels(value: string): string { return value; }
  @Option({ flags: '--reports-root <path>', description: 'Diretório dos relatórios sem vault' }) parseReports(value: string): string { return value; }
  @Option({ flags: '--profile <name>', description: 'Perfil padrão; use "Sem perfil" para arquivos genéricos' }) parseProfile(value: string): string { return value; }
  @Option({ flags: '--create-profile <name>', description: 'Cria um perfil local e o torna padrão' }) parseCreateProfile(value: string): string { return value; }
  @Option({ flags: '--vault <path>', description: 'Associa um vault existente' }) parseVault(value: string): string { return value; }
  @Option({ flags: '--create-vault <path>', description: 'Cria e associa um vault local' }) parseCreateVault(value: string): string { return value; }
}
