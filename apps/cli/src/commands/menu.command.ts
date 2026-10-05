import { Injectable } from '@nestjs/common';
import { CommandRunner, DefaultCommand } from 'nest-commander';
import * as p from '@clack/prompts';
import { StorageService } from '@mt/storage';
import { EnvironmentSetupService, WorkspaceDiscoveryService } from '@mt/setup';
import { CliAssistantService } from '../tui/cli-assistant.service';
import { TerminalUiService } from '../tui/terminal-ui.service';

@Injectable()
@DefaultCommand({ name: 'mt', description: 'Meeting Transcription — interface de terminal para gravar e transcrever' })
export class MenuCommand extends CommandRunner {
  constructor(
    private readonly storage: StorageService,
    private readonly environment: EnvironmentSetupService,
    private readonly discovery: WorkspaceDiscoveryService,
    private readonly assistants: CliAssistantService,
    private readonly terminal: TerminalUiService,
  ) { super(); }

  async run(): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Execute mt em um terminal interativo, ou use mt record / mt process com opções.');
    try {
      const config = await this.storage.resolveStorageRoot();
      if (!config.preferences.initialized) {
        p.intro('mt — Primeiro uso');
        p.log.info(`OBS: ${this.discovery.isInstalled('OBS') ? 'instalado' : 'não encontrado'} · Ollama: ${await this.environment.checkOllama() ? 'instalado' : 'não encontrado'} · Obsidian: ${this.discovery.isInstalled('Obsidian') ? 'instalado' : 'não encontrado'}`);
        await this.assistants.run('settings');
      }
    } catch (error) { p.log.warn((error as Error).message); }
    await this.terminal.run({ settings: () => this.assistants.run('settings'), prepare: () => this.assistants.run('prepare') });
  }
}
