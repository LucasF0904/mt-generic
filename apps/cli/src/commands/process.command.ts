import * as path from 'node:path';
import { homedir } from 'node:os';
import { Injectable } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as p from '@clack/prompts';
import { RecordingSession } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { LocalRuntimeService } from '@mt/setup';
import { RecordingLibraryService, RecordingService } from '@mt/recording';
import { ProcessingProgress, ProcessingService } from '@mt/processing';

type ProcessTarget = 'local' | 'remote' | 'later';

interface ProcessCommandOptions {
  file?: string;
  directory?: string;
  profile?: string;
  session?: string;
  latest?: boolean;
  local?: boolean;
  audioOnly?: boolean;
  registerSc?: boolean;
}

@Injectable()
@Command({ name: 'process', description: 'Transcreve e sintetiza uma sessão gravada, e roteia a nota' })
export class ProcessCommand extends CommandRunner {
  constructor(
    private readonly storage: StorageService,
    private readonly runtime: LocalRuntimeService,
    private readonly recording: RecordingService,
    private readonly processing: ProcessingService,
    private readonly library: RecordingLibraryService,
  ) {
    super();
  }

  async run(_passedParams: string[] = [], options?: ProcessCommandOptions): Promise<void> {
    p.intro('mt process');

    const config = await this.storage.resolveStorageRoot();

    const recordingRoot = this.storage.layout(config).recordings;
    if ([options?.file, options?.directory, options?.session, options?.latest].filter(Boolean).length > 1) throw new Error('Escolha apenas um de --file, --directory, --session ou --latest.');
    const pending = await this.recording.listPending(recordingRoot);
    const sorted = [...pending].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
    let session: RecordingSession | null = null;
    let file = options?.file;
    if (!file && (options?.directory || (!pending.length && !options?.latest && !options?.session))) {
      file = await this.browse(options?.directory ?? recordingRoot) ?? undefined;
      if (!file) return;
    } else if (!file) {
      if (!pending.length && options?.latest) {
        p.log.info('Nenhuma sessão pendente em Staging.'); p.outro('Nada a processar.'); return;
      }
      const picked = await this.pickSession(sorted, options);
      if (picked === '__browse__') file = await this.browse(recordingRoot) ?? undefined;
      else session = picked;
    }
    if (file) session = await this.library.importVideo(this.expandPath(file), recordingRoot, options?.profile ?? config.preferences.defaultProfile ?? 'Sem perfil');
    if (!session) return;

    const target = await this.pickTarget(options);
    if (target === 'later') {
      p.outro('Sessão mantida em Staging.');
      return;
    }
    if (target === 'remote') {
      p.log.warn('Processamento remoto chega na Fase 3.');
      p.outro('Sessão mantida em Staging.');
      return;
    }

    let audioOnly = options?.audioOnly === true;
    let registerSc = options?.registerSc === true;
    if (!options?.local) {
      if (options?.audioOnly === undefined) {
        const mode = await p.select({ message: 'O que gerar?', options: [
          { value: 'complete', label: 'Transcrição + relatório com análise dos frames' },
          { value: 'audio', label: 'Somente áudio, sem análise por LLM' },
        ] });
        if (p.isCancel(mode)) return;
        audioOnly = mode === 'audio';
      }
      if (options?.registerSc === undefined) {
        const register = await p.confirm({ message: 'Registrar também na memória SC do perfil, com links para os dois arquivos?', initialValue: false });
        if (p.isCancel(register)) return;
        registerSc = register === true;
      }
    }
    try {
      const warnings = await this.runtime.prepare(config, { audioOnly });
      for (const warning of warnings) p.log.warn(warning);
    } catch (error) {
      p.log.error((error as Error).message);
      p.outro('Sessão mantida em Staging. Use mt prepare para configurar a transcrição.');
      return;
    }

    const spin = p.spinner();
    try {
      spin.start('Extraindo áudio e transcrevendo (pode demorar)...');
      const { notePath, transcriptPath, frameAnalysisSkipped, synthesisSkipped, graphRegistration, graphError } = await this.processing.process(
        session,
        config.storageRoot,
        (event) => spin.message(this.describeProgress(event)),
        { audioOnly, registerSc, recordingsRoot: this.storage.layout(config).recordings },
      );
      spin.stop('Pipeline concluído.');
      if (frameAnalysisSkipped && !audioOnly) {
        p.log.warn(
          'Análise de tela não pôde rodar nesta sessão (ex.: modelo de visão não baixado no Ollama) — a nota seguiu só com a transcrição.',
        );
      }
      if (synthesisSkipped && !audioOnly) p.log.warn('Resumo automático indisponível; transcrição e relatório foram preservados.');
      if (graphError) p.log.warn(`Arquivos salvos; registro SC falhou: ${graphError}`);
      if (graphRegistration === 'no-profile-memory') p.log.warn('Arquivos salvos; o perfil não possui memória SC referenciada.');
      if (graphRegistration === 'registered' || graphRegistration === 'already-registered') p.log.success('Reunião registrada na memória SC com referências aos dois arquivos.');
      p.log.success(`Transcrição gravada em ${transcriptPath}`);
      p.log.success(`Nota gravada em ${notePath}`);
      p.outro('Processamento concluído.');
    } catch (error) {
      spin.stop('Falha ao processar.');
      p.log.error(`Falha ao processar a sessão: ${(error as Error).message}`);
      p.outro('A sessão continua em Staging para você tentar de novo.');
    }
  }

  private describeProgress(event: ProcessingProgress): string {
    switch (event.stage) {
      case 'transcribe':
        return event.percent === undefined ? 'Transcrevendo...' : `Transcrevendo... ${event.percent}%`;
      case 'frames':
        return `Analisando a tela: frame ${event.done}/${event.total}`;
      case 'synthesize':
        return 'Sintetizando a ata...';
      case 'route':
        return 'Gravando a nota...';
    }
  }

  /** Resolves the session to process, or `null` when the run should stop (cancelled / bad id). */
  private async pickSession(
    sorted: RecordingSession[],
    options?: ProcessCommandOptions,
  ): Promise<RecordingSession | '__browse__' | null> {
    if (options?.session) {
      const found = sorted.find((candidate) => candidate.sessionId === options.session);
      if (!found) {
        p.log.error(`Sessão "${options.session}" não está pendente em Staging.`);
        p.outro('Abortado.');
        return null;
      }
      return found;
    }

    if (options?.latest) {
      p.log.info(`Sessão mais recente: ${sorted[0].sessionId} · ${sorted[0].profileName}`);
      return sorted[0];
    }

    const pickedId = await p.select({
      message: 'Sessão para processar:',
      options: [...sorted.map((session) => ({
        value: session.sessionId,
        label: `${session.sessionId} · ${session.profileName}`,
      })), { value: '__browse__', label: 'Abrir pasta e escolher outro vídeo' }],
    });
    if (p.isCancel(pickedId)) {
      p.cancel('Cancelado.');
      return null;
    }
    if (pickedId === '__browse__') return '__browse__';
    return sorted.find((candidate) => candidate.sessionId === pickedId) ?? null;
  }

  private expandPath(value: string): string { return path.resolve(value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value); }

  private async browse(initialDirectory: string): Promise<string | null> {
    let directory = this.expandPath(initialDirectory);
    while (true) {
      const entries = await this.library.list(directory);
      const selection = await p.select({ message: `Vídeos em ${directory}`, options: [
        { value: '__parent__', label: '.. / Pasta acima' },
        { value: '__path__', label: 'Digitar outra pasta' },
        ...entries.map(entry => ({ value: entry.path, label: `${entry.directory ? '[pasta]' : '[vídeo]'} ${entry.name}` })),
        { value: '__cancel__', label: 'Voltar' },
      ] });
      if (p.isCancel(selection) || selection === '__cancel__') return null;
      if (selection === '__parent__') { directory = path.dirname(directory); continue; }
      if (selection === '__path__') {
        const value = await p.text({ message: 'Caminho da pasta:', defaultValue: directory });
        if (p.isCancel(value)) continue;
        directory = this.expandPath(value); continue;
      }
      const entry = entries.find(entry => entry.path === selection);
      if (entry?.directory) directory = entry.path;
      else if (entry) return entry.path;
    }
  }

  private async pickTarget(options?: ProcessCommandOptions): Promise<ProcessTarget> {
    if (options?.local) {
      return 'local';
    }

    const target = await p.select({
      message: 'Onde processar?',
      options: [
        { value: 'local', label: 'Local agora' },
        { value: 'remote', label: 'Enviar para o servidor (Fase 3 — em breve)' },
        { value: 'later', label: 'Sair e deixar pendente' },
      ],
    });
    return p.isCancel(target) ? 'later' : (target as ProcessTarget);
  }

  @Option({ flags: '--file <path>', description: 'Transcreve um vídeo existente, preservando o original' }) parseFile(value: string): string { return value; }
  @Option({ flags: '--directory <path>', description: 'Abre o navegador de vídeos nesta pasta' }) parseDirectory(value: string): string { return value; }
  @Option({ flags: '--profile <name>', description: 'Perfil para o vídeo importado' }) parseProfile(value: string): string { return value; }
  @Option({ flags: '--audio-only', description: 'Transcreve áudio sem Ollama ou análise visual' }) parseAudioOnly(): boolean { return true; }
  @Option({ flags: '--register-sc', description: 'Salva também na memória JSONL do perfil com referências aos arquivos' }) parseRegisterSc(): boolean { return true; }

  @Option({ flags: '--session <id>', description: 'Processa a sessão com este id, sem perguntar' })
  parseSession(value: string): string {
    return value;
  }

  @Option({ flags: '--latest', description: 'Processa a sessão pendente mais recente, sem perguntar' })
  parseLatest(): boolean {
    return true;
  }

  @Option({ flags: '--local', description: 'Processa localmente, sem perguntar o destino' })
  parseLocal(): boolean {
    return true;
  }
}
