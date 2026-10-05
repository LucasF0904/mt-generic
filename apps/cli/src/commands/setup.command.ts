import { Inject, Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as p from '@clack/prompts';
import { StorageService } from '@mt/storage';
import { EnvironmentSetupService } from '@mt/setup';
import { ObsService } from '@mt/obs';
import { CURRENT_PLATFORM, SupportedPlatform } from '@mt/platform';

const OLLAMA_MODELS = ['llama3.2:3b', 'qwen2.5vl'];

const PLATFORM_LABEL: Record<SupportedPlatform, string> = { windows: 'Windows', macos: 'macOS' };

interface SetupCommandOptions {
  relocateStorage?: boolean;
  pullModels?: boolean;
  skipModelPull?: boolean;
  obsUrl?: string;
  obsPassword?: string;
}

@Injectable()
@Command({ name: 'setup', description: 'Prepara o ambiente: storage, ffmpeg, Ollama, whisper.cpp, OBS' })
export class SetupCommand extends CommandRunner {
  constructor(
    private readonly storage: StorageService,
    private readonly env: EnvironmentSetupService,
    private readonly obs: ObsService,
    @Inject(CURRENT_PLATFORM) private readonly platform: SupportedPlatform,
  ) {
    super();
  }

  async run(_passedParams: string[] = [], options?: SetupCommandOptions): Promise<void> {
    p.intro('mt setup');
    p.log.info(`Plataforma: ${PLATFORM_LABEL[this.platform]}`);

    const config = await this.storage.resolveStorageRoot({ force: options?.relocateStorage === true });
    p.log.success(`Storage root: ${config.storageRoot}`);

    const ffmpegOk = await this.env.checkFfmpeg();
    p.log[ffmpegOk ? 'success' : 'warn'](
      `FFmpeg: ${ffmpegOk ? 'ok' : 'não encontrado — instale e rode "mt setup" de novo'}`,
    );

    const ollamaOk = await this.env.checkOllama();
    p.log[ollamaOk ? 'success' : 'warn'](
      `Ollama: ${ollamaOk ? 'ok' : 'não encontrado — instale e rode "mt setup" de novo'}`,
    );

    if (ollamaOk) {
      const pull = await this.shouldPullModels(options);
      if (pull) {
        await this.env.pullOllamaModels(OLLAMA_MODELS, config.storageRoot);
        p.log.success('Modelos do Ollama prontos.');
      }
    }

    const whisperOk = await this.env.checkWhisperCpp(config.storageRoot);
    p.log[whisperOk ? 'success' : 'warn'](
      whisperOk
        ? 'whisper.cpp: ok'
        : `whisper.cpp: binário não encontrado em ${this.env.whisperCliPath(config.storageRoot)} — build manual necessário, ver README`,
    );

    const cachedObs = this.storage.resolveObsConnection(config);
    const obsUrl = options?.obsUrl ?? cachedObs.url;
    const obsPassword = options?.obsPassword ?? cachedObs.password;

    const obsOk = await this.obs.testConnection(obsUrl, obsPassword);
    p.log[obsOk ? 'success' : 'warn'](
      obsOk
        ? 'OBS websocket: ok'
        : 'OBS websocket: não conectou — habilite em Tools > obs-websocket Settings no OBS; se pedir senha, rode "mt setup --obs-password <senha>" (Tools > WebSocket Server Settings no OBS)',
    );

    if (obsOk && (options?.obsUrl !== undefined || options?.obsPassword !== undefined)) {
      await this.storage.saveObsConnection(config, { url: obsUrl, password: obsPassword });
      p.log.success('Conexão com o OBS salva — outros comandos não vão precisar de MT_OBS_URL/MT_OBS_PASSWORD.');
    }

    if (obsOk) {
      const displays = await this.obs.configureScenes(this.storage.layout(config).recordings, obsUrl, obsPassword);
      p.log.success(`Cenas configuradas para ${displays.length} display(s).`);
    }

    p.outro('Setup concluído.');
  }

  private async shouldPullModels(options?: SetupCommandOptions): Promise<boolean> {
    if (options?.pullModels === true) {
      return true;
    }
    if (options?.skipModelPull === true) {
      return false;
    }
    const result = await p.confirm({ message: 'Baixar/atualizar os modelos do Ollama agora?' });
    return result === true;
  }

  @Option({
    flags: '--relocate-storage',
    description: 'Force re-scan of the disk with the most free space, ignoring any cached storage root',
  })
  parseRelocateStorage(): boolean {
    return true;
  }

  @Option({
    flags: '--pull-models',
    description: 'Baixa/atualiza os modelos do Ollama sem perguntar',
  })
  parsePullModels(): boolean {
    return true;
  }

  @Option({
    flags: '--skip-model-pull',
    description: 'Não baixa/atualiza os modelos do Ollama, sem perguntar',
  })
  parseSkipModelPull(): boolean {
    return true;
  }

  @Option({
    flags: '--obs-url <url>',
    description: 'URL do servidor WebSocket do OBS a salvar (default: ws://127.0.0.1:4455)',
  })
  parseObsUrl(value: string): string {
    return value;
  }

  @Option({
    flags: '--obs-password <password>',
    description: 'Senha do WebSocket do OBS a salvar, pra não precisar de MT_OBS_PASSWORD toda vez',
  })
  parseObsPassword(value: string): string {
    return value;
  }
}
