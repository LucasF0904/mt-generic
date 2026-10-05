import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as p from '@clack/prompts';
import { StorageService } from '@mt/storage';
import { LocalRuntimeService } from '@mt/setup';

@Injectable()
@Command({ name: 'prepare', description: 'Prepara transcrição e análise locais; baixa os modelos ausentes' })
export class PrepareCommand extends CommandRunner {
  constructor(private readonly storage: StorageService, private readonly runtime: LocalRuntimeService) { super(); }
  async run(_params: string[] = [], options: { installTools?: boolean; audioOnly?: boolean } = {}): Promise<void> {
    p.intro('Preparar processamento local');
    const config = await this.storage.resolveStorageRoot();
    const spinner = p.spinner(); spinner.start('Verificando ferramentas e modelos (downloads podem demorar)...');
    try {
      const warnings = await this.runtime.prepare(config, { ...options, download: true });
      spinner.stop('Preparação concluída.');
      for (const warning of warnings) p.log.warn(warning);
      p.outro('Pronto para transcrever gravações localmente.');
    } catch (error) { spinner.stop('Preparação incompleta.'); throw error; }
  }
  @Option({ flags: '--install-tools', description: 'Instala ferramentas ausentes com Homebrew/winget e whisper.cpp oficial' }) parseInstall(): boolean { return true; }
  @Option({ flags: '--audio-only', description: 'Prepara somente transcrição de áudio, sem Ollama' }) parseAudioOnly(): boolean { return true; }
}
