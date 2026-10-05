import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as p from '@clack/prompts';
import { ProfileService } from '@mt/profiles';
import { StorageService } from '@mt/storage';
import { ObsService } from '@mt/obs';
import { RecordingService } from '@mt/recording';
import { AudioMode, DisplayInfo, Profile } from '@mt/domain';

interface RecordCommandOptions {
  profile?: string;
  display?: number;
  mic?: boolean;
  captureKeys?: boolean;
  seconds?: number;
}

@Injectable()
@Command({ name: 'record', description: 'Grava uma reunião (tela + áudio) via OBS' })
export class RecordCommand extends CommandRunner {
  constructor(
    private readonly profiles: ProfileService,
    private readonly storage: StorageService,
    private readonly obs: ObsService,
    private readonly recording: RecordingService,
  ) {
    super();
  }

  async run(_passedParams: string[] = [], options?: RecordCommandOptions): Promise<void> {
    p.intro('mt record');

    const config = await this.storage.resolveStorageRoot();
    const recordingRoot = this.storage.layout(config).recordings;
    const availableProfiles = await this.profiles.listAvailableProfiles();
    if (!availableProfiles.some(profile => profile.name === 'Sem perfil')) availableProfiles.push(new Profile('Sem perfil'));
    const defaultProfile = config.preferences.defaultProfile;
    const profileName = await this.pickProfile(availableProfiles, {
      ...options,
      profile: options?.profile ?? (availableProfiles.some(profile => profile.name === defaultProfile) ? defaultProfile : undefined),
    });
    if (!profileName) return;

    const { url: obsUrl, password: obsPassword } = this.storage.resolveObsConnection(config);

    p.log.info('Preparando OBS e detectando as telas conectadas...');
    const displays = await this.obs.configureScenes(recordingRoot, obsUrl, obsPassword);
    if (displays.length === 0) {
      p.log.error('Nenhum monitor detectado pelo OBS.');
      p.outro('Cancelado.');
      return;
    }
    const display = await this.pickDisplay(displays, options);
    if (!display) {
      return;
    }

    const audioMode = await this.pickAudioMode(options);
    if (!audioMode) {
      return;
    }

    // Cliques + janela ativa são sempre registrados; teclado bruto é opt-in
    // explícito por sessão (design spec §7 passo 5) — menor sensibilidade por padrão.
    const captureRawKeys = await this.pickCaptureRawKeys(options);
    if (captureRawKeys === null) {
      return;
    }

    const sceneName = display.sceneName(audioMode);

    p.log.info(`Iniciando gravação na cena ${sceneName}...`);
    await this.obs.startRecording(sceneName, obsUrl, obsPassword);
    const { handle: inputLogger, outputPath: inputEventsPath } = await this.recording.startInputLogging(
      captureRawKeys,
      recordingRoot,
    );

    const stopped = await this.waitForStop(options);
    if (!stopped) {
      try {
        const videoPath = await this.obs.stopRecording(obsUrl, obsPassword);
        p.log.info(`Gravação interrompida salva em: ${videoPath}`);
      } finally {
        await inputLogger.stop();
      }
      p.cancel('Cancelado.');
      return;
    }

    let videoPath: string;
    try {
      videoPath = await this.obs.stopRecording(obsUrl, obsPassword);
    } catch (error) {
      await inputLogger.stop();
      p.log.error(`Falha ao parar a gravação no OBS: ${(error as Error).message}`);
      p.outro('A gravação pode não ter sido finalizada corretamente — confira o OBS.');
      return;
    }

    const { crashed: inputLoggerCrashed } = await inputLogger.stop();
    if (inputLoggerCrashed) {
      p.log.warn(
        'Log de cliques/janela ativa falhou nesta sessão (ex.: permissão de Acessibilidade não concedida no macOS) — a gravação em si não foi afetada.',
      );
    }

    let session;
    try {
      session = await this.recording.stopAndStage({
        profileName,
        displayIndex: display.monitorIndex,
        audioMode,
        videoPath,
        storageRoot: recordingRoot,
        inputEventsPath: inputLoggerCrashed ? undefined : inputEventsPath,
      });
    } catch (error) {
      p.log.error(
        `A gravação terminou em "${videoPath}", mas falhou ao mover para staging: ${(error as Error).message}. Você pode mover o arquivo manualmente depois.`,
      );
      p.outro('Erro ao arquivar a sessão.');
      return;
    }

    p.log.success(`Sessão gravada: ${session.sessionId}`);
    p.outro('Gravação concluída. Rode "mt process" quando quiser transcrever.');
  }

  private async pickProfile(available: Profile[], options?: RecordCommandOptions): Promise<string | null> {
    if (options?.profile) {
      if (!available.some((profile) => profile.name === options.profile)) {
        p.log.error(`Perfil "${options.profile}" não está disponível nesta máquina.`);
        p.outro('Cancelado.');
        return null;
      }
      return options.profile;
    }

    const result = await p.select({
      message: 'Perfil/destino:',
      options: available.map((profile) => ({ value: profile.name, label: profile.name })),
    });
    if (p.isCancel(result)) {
      p.cancel('Cancelado.');
      return null;
    }
    return result as string;
  }

  private async pickDisplay(displays: DisplayInfo[], options?: RecordCommandOptions): Promise<DisplayInfo | null> {
    if (options?.display !== undefined) {
      const found = displays.find((candidate) => candidate.monitorIndex === options.display);
      if (!found) {
        p.log.error(`Tela ${options.display} não foi detectada pelo OBS.`);
        p.outro('Cancelado.');
        return null;
      }
      return found;
    }

    const result = await p.select({
      message: 'Qual tela gravar?',
      options: displays.map((display) => ({ value: display.monitorIndex, label: display.monitorName })),
    });
    if (p.isCancel(result)) {
      p.cancel('Cancelado.');
      return null;
    }
    return displays.find((candidate) => candidate.monitorIndex === result)!;
  }

  private async pickAudioMode(options?: RecordCommandOptions): Promise<AudioMode | null> {
    if (options?.mic !== undefined) {
      return options.mic ? AudioMode.MeetingWithMic : AudioMode.Meeting;
    }

    const result = await p.confirm({ message: 'Gravar microfone também?' });
    if (p.isCancel(result)) {
      p.cancel('Cancelado.');
      return null;
    }
    return result === true ? AudioMode.MeetingWithMic : AudioMode.Meeting;
  }

  private async pickCaptureRawKeys(options?: RecordCommandOptions): Promise<boolean | null> {
    if (options?.captureKeys !== undefined) {
      return options.captureKeys;
    }

    const result = await p.confirm({ message: 'Capturar teclado bruto?', initialValue: false });
    if (p.isCancel(result)) {
      p.cancel('Cancelado.');
      return null;
    }
    return result === true;
  }

  /** Waits for the recording to stop: a fixed `--seconds`, or the interactive confirm. Returns false on cancel. */
  private async waitForStop(options?: RecordCommandOptions): Promise<boolean> {
    if (options?.seconds !== undefined) {
      p.log.info(`Gravando por ${options.seconds}s...`);
      await new Promise((resolve) => setTimeout(resolve, options.seconds! * 1000));
      return true;
    }

    const result = await p.confirm({ message: 'Gravando. Confirme para parar.', initialValue: true });
    return !p.isCancel(result);
  }

  @Option({ flags: '--profile <name>', description: 'Perfil/destino, sem perguntar' })
  parseProfile(value: string): string {
    return value;
  }

  @Option({ flags: '--display <index>', description: 'Índice do monitor a gravar, sem perguntar' })
  parseDisplay(value: string): number {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0) throw new Error('--display deve ser um índice inteiro a partir de zero.');
    return index;
  }

  @Option({ flags: '--mic', description: 'Grava o microfone também, sem perguntar' })
  parseMic(): boolean {
    return true;
  }

  @Option({ flags: '--no-mic', description: 'Não grava microfone, sem perguntar' })
  parseNoMic(): boolean { return false; }

  @Option({ flags: '--capture-keys', description: 'Captura teclado bruto, sem perguntar' })
  parseCaptureKeys(): boolean {
    return true;
  }

  @Option({ flags: '--no-capture-keys', description: 'Não captura teclado bruto, sem perguntar' })
  parseNoCaptureKeys(): boolean { return false; }

  @Option({ flags: '--seconds <n>', description: 'Para a gravação sozinho após N segundos, sem perguntar' })
  parseSeconds(value: string): number {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--seconds deve ser um número positivo e finito.');
    return seconds;
  }
}
