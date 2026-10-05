import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as p from '@clack/prompts';
import { ProcessCommand } from './process.command';
import { StorageService } from '@mt/storage';
import { LocalRuntimeService } from '@mt/setup';
import { RecordingLibraryService, RecordingService } from '@mt/recording';
import { ProcessingService } from '@mt/processing';
import { AudioMode, MachineConfig, RecordingSession } from '@mt/domain';

const { spin } = vi.hoisted(() => ({
  spin: { start: vi.fn(), stop: vi.fn(), message: vi.fn() },
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
  select: vi.fn(),
  confirm: vi.fn().mockResolvedValue(false),
  isCancel: vi.fn(() => false),
  spinner: vi.fn(() => spin),
}));

const makeSession = (id: string, recordedAt: string, profile = 'equipe') =>
  new RecordingSession(
    id,
    profile,
    0,
    AudioMode.Meeting,
    new Date(recordedAt),
    `/srv/MeetingAI/Staging/${id}/recording.mkv`,
  );

const older = makeSession('2026-09-01T10-00-00-000Z', '2026-09-01T10:00:00.000Z');
const newer = makeSession('2026-09-03T20-00-00-000Z', '2026-09-03T20:00:00.000Z', 'cliente');

describe('ProcessCommand', () => {
  let command: ProcessCommand;
  let storage: StorageService;
  let env: LocalRuntimeService;
  let recording: RecordingService;
  let processing: ProcessingService;
  let library: RecordingLibraryService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(p.select).mockReset();
    vi.mocked(p.isCancel).mockReturnValue(false);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProcessCommand,
        { provide: RecordingLibraryService, useValue: { list: vi.fn().mockResolvedValue([]), importVideo: vi.fn() } },
        { provide: StorageService, useValue: { resolveStorageRoot: vi.fn(), layout: () => ({ recordings: '/srv/MeetingAI' }) } },
        {
          provide: LocalRuntimeService,
          useValue: { prepare: vi.fn().mockResolvedValue([]) },
        },
        { provide: RecordingService, useValue: { listPending: vi.fn() } },
        { provide: ProcessingService, useValue: { process: vi.fn() } },
      ],
    }).compile();

    command = moduleRef.get(ProcessCommand);
    library = moduleRef.get(RecordingLibraryService);
    storage = moduleRef.get(StorageService);
    env = moduleRef.get(LocalRuntimeService);
    recording = moduleRef.get(RecordingService);
    processing = moduleRef.get(ProcessingService);

    vi.mocked(storage.resolveStorageRoot).mockResolvedValue(new MachineConfig('/srv/MeetingAI', new Date()));
    vi.mocked(recording.listPending).mockResolvedValue([older, newer]);
    vi.mocked(processing.process).mockResolvedValue({
      notePath: '/vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.md',
      transcriptPath: '/vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.transcript.txt',
      frameAnalysisSkipped: false, synthesisSkipped: false,
    });
    // 1st select => session, 2nd select => target
    vi.mocked(p.select).mockResolvedValueOnce(newer.sessionId as never).mockResolvedValueOnce('local' as never);
  });

  it('processes an explicit video with no pending sessions', async () => {
    vi.mocked(recording.listPending).mockResolvedValue([]);
    vi.mocked(library.importVideo).mockResolvedValue(newer);
    await command.run([], { file: '/external/video.mov', local: true, profile: 'Trabalho' });
    expect(library.importVideo).toHaveBeenCalledWith('/external/video.mov', '/srv/MeetingAI', 'Trabalho');
    expect(processing.process).toHaveBeenCalledWith(newer, '/srv/MeetingAI', expect.any(Function), expect.any(Object));
  });

  it('opens the recording folder when there are no sessions and lets the user choose a video', async () => {
    vi.mocked(recording.listPending).mockResolvedValue([]);
    vi.mocked(library.list).mockResolvedValue([{ name: 'video.mp4', path: '/srv/MeetingAI/video.mp4', directory: false, size: 100, modifiedAt: new Date() }]);
    vi.mocked(library.importVideo).mockResolvedValue(newer);
    vi.mocked(p.select).mockReset().mockResolvedValueOnce('/srv/MeetingAI/video.mp4');
    await command.run([], { local: true });
    expect(library.list).toHaveBeenCalledWith('/srv/MeetingAI');
    expect(processing.process).toHaveBeenCalled();
  });

  it('stops early when there is nothing in staging', async () => {
    vi.mocked(recording.listPending).mockResolvedValue([]);

    await command.run([], { latest: true, local: true });

    expect(p.log.info).toHaveBeenCalledWith('Nenhuma sessão pendente em Staging.');
    expect(processing.process).not.toHaveBeenCalled();
  });

  it('lists pending sessions newest first', async () => {
    await command.run();

    const [firstSelectArgs] = vi.mocked(p.select).mock.calls;
    expect((firstSelectArgs[0] as { options: { value: string }[] }).options.map((o) => o.value)).toEqual([
      newer.sessionId,
      older.sessionId,
      '__browse__',
    ]);
  });

  it('runs the local pipeline for the chosen session and reports both file paths', async () => {
    await command.run();

    expect(processing.process).toHaveBeenCalledWith(newer, '/srv/MeetingAI', expect.any(Function), expect.objectContaining({ recordingsRoot: '/srv/MeetingAI' }));
    expect(spin.start).toHaveBeenCalled();
    expect(spin.stop).toHaveBeenCalledWith('Pipeline concluído.');
    expect(p.log.success).toHaveBeenCalledWith(
      'Transcrição gravada em /vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.transcript.txt',
    );
    expect(p.log.success).toHaveBeenCalledWith(
      'Nota gravada em /vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.md',
    );
  });

  it('renders each progress stage on the spinner', async () => {
    await command.run();

    const onProgress = vi.mocked(processing.process).mock.calls[0][2]!;
    onProgress({ stage: 'transcribe', percent: 42 });
    onProgress({ stage: 'transcribe' });
    onProgress({ stage: 'frames', done: 2, total: 5 });
    onProgress({ stage: 'synthesize' });
    onProgress({ stage: 'route' });

    expect(spin.message).toHaveBeenNthCalledWith(1, 'Transcrevendo... 42%');
    expect(spin.message).toHaveBeenNthCalledWith(2, 'Transcrevendo...');
    expect(spin.message).toHaveBeenNthCalledWith(3, 'Analisando a tela: frame 2/5');
    expect(spin.message).toHaveBeenNthCalledWith(4, 'Sintetizando a ata...');
    expect(spin.message).toHaveBeenNthCalledWith(5, 'Gravando a nota...');
  });

  it('leaves the session pending when the target is "later"', async () => {
    vi.mocked(p.select).mockReset().mockResolvedValueOnce(newer.sessionId as never).mockResolvedValueOnce('later' as never);

    await command.run();

    expect(processing.process).not.toHaveBeenCalled();
    expect(p.outro).toHaveBeenCalledWith('Sessão mantida em Staging.');
  });

  it('defers remote processing to Fase 3', async () => {
    vi.mocked(p.select)
      .mockReset()
      .mockResolvedValueOnce(newer.sessionId as never)
      .mockResolvedValueOnce('remote' as never);

    await command.run();

    expect(p.log.warn).toHaveBeenCalledWith('Processamento remoto chega na Fase 3.');
    expect(processing.process).not.toHaveBeenCalled();
  });

  it('aborts with the missing dependency names before touching the pipeline', async () => {
    vi.mocked(env.prepare).mockRejectedValue(new Error('whisper.cpp ausente'));

    await command.run();

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('whisper.cpp'));
    expect(processing.process).not.toHaveBeenCalled();
  });

  it('warns when frame analysis was skipped but still reports success', async () => {
    vi.mocked(processing.process).mockResolvedValue({
      notePath: '/vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.md',
      transcriptPath: '/vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.transcript.txt',
      frameAnalysisSkipped: true, synthesisSkipped: false,
    });

    await command.run();

    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('Análise de tela não pôde rodar'));
    expect(p.log.success).toHaveBeenCalledWith(
      'Nota gravada em /vaults/cliente/Meetings/2026-09-03T20-00-00-000Z.md',
    );
  });

  it('keeps the session in staging when the pipeline throws', async () => {
    vi.mocked(processing.process).mockRejectedValue(new Error('Ollama offline'));

    await command.run();

    expect(spin.stop).toHaveBeenCalledWith('Falha ao processar.');
    expect(p.log.error).toHaveBeenCalledWith('Falha ao processar a sessão: Ollama offline');
    expect(p.outro).toHaveBeenCalledWith('A sessão continua em Staging para você tentar de novo.');
  });

  it('cancels cleanly when the session prompt is aborted', async () => {
    vi.mocked(p.select).mockReset().mockResolvedValueOnce(Symbol('cancel') as never);
    vi.mocked(p.isCancel).mockReturnValueOnce(true);

    await command.run();

    expect(p.cancel).toHaveBeenCalledWith('Cancelado.');
    expect(processing.process).not.toHaveBeenCalled();
  });

  it('runs fully non-interactively with --latest --local', async () => {
    vi.mocked(p.select).mockReset();

    await command.run([], { latest: true, local: true });

    expect(p.select).not.toHaveBeenCalled();
    expect(processing.process).toHaveBeenCalledWith(newer, '/srv/MeetingAI', expect.any(Function), expect.objectContaining({ recordingsRoot: '/srv/MeetingAI' }));
  });

  it('processes the session named by --session', async () => {
    vi.mocked(p.select).mockReset();

    await command.run([], { session: older.sessionId, local: true });

    expect(processing.process).toHaveBeenCalledWith(older, '/srv/MeetingAI', expect.any(Function), expect.objectContaining({ recordingsRoot: '/srv/MeetingAI' }));
  });

  it('aborts when --session names a session that is not pending', async () => {
    vi.mocked(p.select).mockReset();

    await command.run([], { session: 'nope', local: true });

    expect(p.log.error).toHaveBeenCalledWith('Sessão "nope" não está pendente em Staging.');
    expect(processing.process).not.toHaveBeenCalled();
  });
});
