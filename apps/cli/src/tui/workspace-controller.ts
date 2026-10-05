import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { MachineConfig, DisplayInfo, Profile, AudioMode } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { ProfileService } from '@mt/profiles';
import { ObsService } from '@mt/obs';
import { RecordingService, RecordingLibraryService, RecordingEntry } from '@mt/recording';
import { InputLoggerHandle } from '../../../../libs/recording/src/input-logger';
import { LocalRuntimeService } from '@mt/setup';
import { ProcessingService, ProcessResult, ProcessingProgress } from '@mt/processing';

export type WorkspacePhase = 'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'configuring';
export interface WorkspaceState {
  phase: WorkspacePhase; directory: string; entries: RecordingEntry[]; selectedPath?: string;
  profiles: Profile[]; profileName: string; displays: DisplayInfo[]; displayIndex?: number;
  mic: boolean; captureKeys: boolean; audioOnly: boolean; registerSc: boolean;
  status: string; messages: string[]; startedAt?: number; result?: ProcessResult;
}

@Injectable()
export class WorkspaceController extends EventEmitter {
  readonly state: WorkspaceState = {
    phase: 'idle', directory: '', entries: [], profiles: [], profileName: 'Sem perfil', displays: [],
    mic: false, captureKeys: false, audioOnly: false, registerSc: false,
    status: 'Carregando ambiente...', messages: [],
  };
  private config?: MachineConfig;
  private active?: { root: string; profileName: string; display: DisplayInfo; mode: AudioMode; connection: { url?: string; password?: string }; logger?: InputLoggerHandle; inputPath?: string };
  constructor(
    private readonly storage: StorageService, private readonly profiles: ProfileService,
    private readonly obs: ObsService, private readonly recording: RecordingService,
    private readonly library: RecordingLibraryService, private readonly runtime: LocalRuntimeService,
    private readonly processing: ProcessingService,
  ) { super(); }

  async initialize(): Promise<void> {
    this.assertIdle();
    this.config = await this.storage.resolveStorageRoot();
    this.state.profiles = await this.profiles.listAvailableProfiles();
    if (!this.state.profiles.some(profile => profile.name === 'Sem perfil')) this.state.profiles.push(new Profile('Sem perfil'));
    this.state.profileName = this.state.profiles.find(profile => profile.name === this.config?.preferences.defaultProfile)?.name ?? this.state.profiles[0].name;
    await this.browse(this.storage.layout(this.config).recordings);
    try { await this.configureObs(); }
    catch (error) { this.log(`OBS: ${(error as Error).message}. Use [v] para tentar novamente.`); }
  }

  async configureObs(): Promise<void> {
    this.assertIdle(); this.update('configuring', 'Preparando OBS e monitores...');
    try {
      this.config = await this.storage.resolveStorageRoot();
      const connection = this.storage.resolveObsConnection(this.config);
      this.state.displays = await this.obs.configureScenes(this.storage.layout(this.config).recordings, connection.url, connection.password);
      if (!this.state.displays.some(display => display.monitorIndex === this.state.displayIndex)) this.state.displayIndex = this.state.displays[0]?.monitorIndex;
      this.log(`OBS pronto: ${this.state.displays.length} tela(s).`);
    } finally { this.update('idle', 'Escolha a tela e pressione [r] para gravar.'); }
  }

  async browse(directory: string): Promise<void> {
    const entries = await this.library.list(directory);
    this.state.directory = path.resolve(directory); this.state.entries = entries;
    if (!entries.some(entry => entry.path === this.state.selectedPath)) this.state.selectedPath = entries[0]?.path;
    this.emit('change');
  }
  select(filePath?: string): void { this.state.selectedPath = filePath; this.emit('change'); }
  setOptions(options: Partial<Pick<WorkspaceState, 'profileName' | 'displayIndex' | 'mic' | 'captureKeys' | 'audioOnly' | 'registerSc'>>): void {
    this.assertIdle(); Object.assign(this.state, options); this.emit('change');
  }
  log(message: string): void { this.state.messages = [...this.state.messages.slice(-99), message]; this.emit('change'); }
  private update(phase: WorkspacePhase, status: string): void { this.state.phase = phase; this.state.status = status; this.emit('change'); }
  private assertIdle(): void { if (this.state.phase !== 'idle') throw new Error('Há uma operação em andamento. Pare a gravação ou aguarde o processamento.'); }

  async startRecording(): Promise<void> {
    this.assertIdle();
    // Every recording rechecks the attached displays and OBS scene readiness.
    await this.configureObs();
    this.update('starting', 'Iniciando gravação...');
    try {
      const display = this.state.displays.find(display => display.monitorIndex === this.state.displayIndex);
      if (!display || !this.config) throw new Error('Nenhuma tela disponível. Configure o OBS primeiro.');
      const connection = this.storage.resolveObsConnection(this.config);
      const root = this.storage.layout(this.config).recordings;
      const mode = this.state.mic ? AudioMode.MeetingWithMic : AudioMode.Meeting;
      await this.obs.startRecording(display.sceneName(mode), connection.url, connection.password);
      this.active = { root, profileName: this.state.profileName, display, mode, connection };
      try {
        const logger = await this.recording.startInputLogging(this.state.captureKeys, root);
        this.active.logger = logger.handle; this.active.inputPath = logger.outputPath;
      } catch (error) { this.log(`Registro de cliques indisponível: ${(error as Error).message}`); }
      this.state.startedAt = Date.now();
      this.update('recording', 'Gravando. Pressione [s] para parar e salvar.');
    } catch (error) { this.update('idle', 'Não foi possível iniciar.'); throw error; }
  }

  async stopRecording(): Promise<void> {
    if (this.state.phase !== 'recording' || !this.active) throw new Error('Nenhuma gravação iniciada pelo mt está ativa.');
    const active = this.active;
    this.update('stopping', 'Finalizando vídeo...');
    let videoPath: string;
    try { videoPath = await this.obs.stopRecording(active.connection.url, active.connection.password); }
    catch (error) { this.update('recording', 'Falha ao parar. Confira OBS e pressione [s] para tentar novamente.'); throw error; }
    this.active = undefined; this.state.startedAt = undefined;
    this.state.selectedPath = videoPath;
    try {
      const logger = await active.logger?.stop();
      if (logger?.crashed) this.log('Logger auxiliar interrompido; o vídeo foi preservado.');
      const session = await this.recording.stopAndStage({ profileName: active.profileName, displayIndex: active.display.monitorIndex,
        audioMode: active.mode, videoPath, storageRoot: active.root, inputEventsPath: logger?.crashed ? undefined : active.inputPath });
      this.state.selectedPath = session.videoPath;
      await this.browse(path.dirname(session.videoPath));
      this.log(`Gravação salva: ${session.videoPath}`);
    } catch (error) { this.log(`Vídeo salvo em ${this.state.selectedPath}. Falha ao arquivar: ${(error as Error).message}`); throw error; }
    finally { this.update('idle', 'Gravação finalizada. [t] transcreve o vídeo selecionado; [r] grava outra.'); }
  }

  async transcribeSelected(): Promise<void> {
    this.assertIdle();
    const file = this.state.selectedPath;
    if (!file || this.state.entries.find(entry => entry.path === file)?.directory) throw new Error('Selecione um vídeo no painel de arquivos. Enter abre pastas.');
    this.update('processing', 'Verificando transcrição local...');
    try {
      const config = await this.storage.resolveStorageRoot();
      const recordingsRoot = this.storage.layout(config).recordings;
      for (const warning of await this.runtime.prepare(config, { audioOnly: this.state.audioOnly })) this.log(warning);
      const session = await this.library.importVideo(file, recordingsRoot, this.state.profileName);
      this.state.result = await this.processing.process(session, config.storageRoot, progress => {
        this.state.status = this.describeProgress(progress); this.emit('change');
      }, { audioOnly: this.state.audioOnly, registerSc: this.state.registerSc, recordingsRoot });
      const result = this.state.result;
      this.log(`Transcrição: ${result.transcriptPath}`); this.log(`Relatório: ${result.notePath}`);
      if (result.frameAnalysisSkipped && !this.state.audioOnly) this.log('Análise visual indisponível; transcrição preservada.');
      if (result.synthesisSkipped && !this.state.audioOnly) this.log('Resumo automático indisponível; relatório contém as fontes.');
      if (result.graphError) this.log(`Registro SC: ${result.graphError}`);
      if (result.graphRegistration) this.log(`SC: ${result.graphRegistration}`);
      // Refresh after staging is moved so the browser never stays in a vanished directory.
      try { await this.browse(path.dirname(file)); }
      catch { await this.browse(recordingsRoot); }
    } finally { this.update('idle', 'Pronto. Consulte os caminhos no histórico ou selecione outro vídeo.'); }
  }
  private describeProgress(event: ProcessingProgress): string {
    switch (event.stage) {
      case 'transcribe': return `Transcrevendo áudio${event.percent === undefined ? '...' : `: ${event.percent}%`}`;
      case 'frames': return `Analisando frames: ${event.done}/${event.total}`;
      case 'synthesize': return 'Gerando resumo...';
      case 'route': return 'Salvando transcrição e relatório...';
    }
  }
}
