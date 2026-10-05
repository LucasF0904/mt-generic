import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as p from '@clack/prompts';
import { RecordCommand } from './record.command';
import { ProfileService } from '@mt/profiles';
import { StorageService } from '@mt/storage';
import { ObsService } from '@mt/obs';
import { RecordingService } from '@mt/recording';
import { AudioMode, DisplayInfo, MachineConfig, Profile, RecordingSession } from '@mt/domain';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  select: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
}));

describe('RecordCommand', () => {
  let command: RecordCommand;
  let profiles: ProfileService;
  let storage: StorageService;
  let obs: ObsService;
  let recording: RecordingService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.MT_OBS_URL;
    delete process.env.MT_OBS_PASSWORD;

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecordCommand,
        { provide: ProfileService, useValue: { listAvailableProfiles: vi.fn() } },
        { provide: StorageService, useValue: { resolveStorageRoot: vi.fn(), layout: vi.fn(() => ({ recordings: 'Z:\\MeetingAI' })), resolveObsConnection: vi.fn() } },
        {
          provide: ObsService,
          useValue: { configureScenes: vi.fn(), startRecording: vi.fn(), stopRecording: vi.fn() },
        },
        { provide: RecordingService, useValue: { stopAndStage: vi.fn(), startInputLogging: vi.fn() } },
      ],
    }).compile();

    command = moduleRef.get(RecordCommand);
    profiles = moduleRef.get(ProfileService);
    storage = moduleRef.get(StorageService);
    obs = moduleRef.get(ObsService);
    recording = moduleRef.get(RecordingService);

    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('demo', 'Z:\\demo-docs')]);
    vi.mocked(storage.resolveStorageRoot).mockResolvedValue(new MachineConfig('Z:\\MeetingAI', new Date()));
    vi.mocked(storage.resolveObsConnection).mockReturnValue({ url: undefined, password: undefined });
    vi.mocked(obs.configureScenes).mockResolvedValue([new DisplayInfo(0, 'Primary')]);
    vi.mocked(obs.stopRecording).mockResolvedValue('Z:\\MeetingAI\\2026-08-26 14-30-00.mkv');
    vi.mocked(p.select).mockImplementation(async ({ options }: any) => options[0].value);
    vi.mocked(p.confirm).mockResolvedValue(true);
    vi.mocked(recording.startInputLogging).mockResolvedValue({
      handle: { stop: vi.fn().mockResolvedValue({ crashed: false }) },
      outputPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl',
    });
    vi.mocked(recording.stopAndStage).mockResolvedValue(
      new RecordingSession(
        '2026-08-26T14-30-00-000Z',
        'demo',
        0,
        AudioMode.MeetingWithMic,
        new Date(),
        'Z:\\MeetingAI\\Staging\\2026-08-26T14-30-00-000Z\\recording.mkv',
      ),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects invalid duration and display flags before recording', () => {
    for (const value of ['NaN', 'Infinity', '0', '-1']) expect(() => command.parseSeconds(value)).toThrow();
    for (const value of ['NaN', 'Infinity', '-1', '1.5']) expect(() => command.parseDisplay(value)).toThrow();
    expect(command.parseSeconds('2.5')).toBe(2.5);
    expect(command.parseDisplay('0')).toBe(0);
  });

  it('records with the microphone when confirmed, using the DISPLAY1-Reuniao-Mic scene', async () => {
    await command.run();

    expect(obs.startRecording).toHaveBeenCalledWith('DISPLAY1-Reuniao-Mic', undefined, undefined);
    expect(recording.stopAndStage).toHaveBeenCalledWith(
      expect.objectContaining({
        profileName: 'demo',
        displayIndex: 0,
        audioMode: AudioMode.MeetingWithMic,
        videoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
        storageRoot: 'Z:\\MeetingAI',
      }),
    );
  });

  it('uses the URL/password from StorageService.resolveObsConnection for every OBS call', async () => {
    vi.mocked(storage.resolveObsConnection).mockReturnValue({
      url: 'ws://192.168.1.10:4455',
      password: 'super-secret',
    });

    await command.run();

    expect(storage.resolveObsConnection).toHaveBeenCalledWith(expect.any(MachineConfig));
    expect(obs.configureScenes).toHaveBeenCalledWith('Z:\\MeetingAI', 'ws://192.168.1.10:4455', 'super-secret');
    expect(obs.startRecording).toHaveBeenCalledWith('DISPLAY1-Reuniao-Mic', 'ws://192.168.1.10:4455', 'super-secret');
    expect(obs.stopRecording).toHaveBeenCalledWith('ws://192.168.1.10:4455', 'super-secret');
  });

  it('starts input logging alongside OBS recording and forwards captureRawKeys and inputEventsPath', async () => {
    await command.run();

    expect(recording.startInputLogging).toHaveBeenCalledWith(true, 'Z:\\MeetingAI');
    expect(recording.stopAndStage).toHaveBeenCalledWith(
      expect.objectContaining({ inputEventsPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl' }),
    );
  });

  it('passes captureRawKeys=false to startInputLogging when the prompt is declined', async () => {
    vi.mocked(p.confirm).mockImplementation(async ({ message }: any) => !message.includes('teclado'));

    await command.run();

    expect(recording.startInputLogging).toHaveBeenCalledWith(false, 'Z:\\MeetingAI');
  });

  it('cancels cleanly and stops the input logger when the "capturar teclado bruto" confirm is cancelled', async () => {
    const cancelSymbol = Symbol('cancel');
    vi.mocked(p.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(cancelSymbol as never);
    vi.mocked(p.isCancel).mockImplementation((value: unknown) => value === cancelSymbol);

    await command.run();

    expect(p.cancel).toHaveBeenCalled();
    expect(obs.startRecording).not.toHaveBeenCalled();
  });

  it('stops the input logger without staging when the "confirme para parar" prompt is cancelled', async () => {
    const cancelSymbol = Symbol('cancel');
    vi.mocked(p.confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(cancelSymbol as never);
    vi.mocked(p.isCancel).mockImplementation((value: unknown) => value === cancelSymbol);
    const stop = vi.fn().mockResolvedValue({ crashed: false });
    vi.mocked(recording.startInputLogging).mockResolvedValue({ handle: { stop }, outputPath: 'x' });

    await command.run();

    expect(stop).toHaveBeenCalled();
    expect(recording.stopAndStage).not.toHaveBeenCalled();
    expect(obs.stopRecording).toHaveBeenCalled();
  });

  it('warns and stages without inputEventsPath when the input logger crashed', async () => {
    vi.mocked(recording.startInputLogging).mockResolvedValue({
      handle: { stop: vi.fn().mockResolvedValue({ crashed: true }) },
      outputPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl',
    });

    await command.run();

    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('Log de cliques'));
    expect(recording.stopAndStage).toHaveBeenCalledWith(expect.objectContaining({ inputEventsPath: undefined }));
  });

  it('stops the input logger when obs.stopRecording fails', async () => {
    vi.mocked(obs.stopRecording).mockRejectedValue(new Error('OBS não respondeu'));
    const stop = vi.fn().mockResolvedValue({ crashed: false });
    vi.mocked(recording.startInputLogging).mockResolvedValue({ handle: { stop }, outputPath: 'x' });

    await command.run();

    expect(stop).toHaveBeenCalled();
  });

  it('runs fully non-interactively with --profile --display --mic --capture-keys --seconds', async () => {
    vi.useFakeTimers();
    try {
      const run = command.run([], { profile: 'demo', display: 0, mic: true, captureKeys: true, seconds: 5 });
      await vi.advanceTimersByTimeAsync(5000);
      await run;
    } finally {
      vi.useRealTimers();
    }

    expect(p.select).not.toHaveBeenCalled();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(obs.startRecording).toHaveBeenCalledWith('DISPLAY1-Reuniao-Mic', undefined, undefined);
    expect(recording.startInputLogging).toHaveBeenCalledWith(true, 'Z:\\MeetingAI');
    expect(recording.stopAndStage).toHaveBeenCalledWith(expect.objectContaining({ profileName: 'demo', displayIndex: 0 }));
  });

  it('rejects --profile naming a profile not available on this machine', async () => {
    await command.run([], { profile: 'nope' });

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
    expect(obs.configureScenes).not.toHaveBeenCalled();
  });

  it('rejects --display naming a monitor OBS did not detect', async () => {
    await command.run([], { display: 9 });

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('Tela 9'));
    expect(obs.startRecording).not.toHaveBeenCalled();
  });

  it('still prompts for whatever flag was not given (--mic only)', async () => {
    await command.run([], { mic: false });

    expect(p.select).toHaveBeenCalled(); // profile and display still prompted
    expect(obs.startRecording).toHaveBeenCalledWith('DISPLAY1-Reuniao', undefined, undefined);
  });

  it('records without the microphone when declined, using the DISPLAY1-Reuniao scene', async () => {
    vi.mocked(p.confirm).mockImplementation(async ({ message }: any) =>
      message.includes('microfone') ? false : true,
    );

    await command.run();

    expect(obs.startRecording).toHaveBeenCalledWith('DISPLAY1-Reuniao', undefined, undefined);
  });

  it('records under a generic profile when no agent profiles exist', async () => {
    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([]);

    await command.run();

    expect(obs.startRecording).toHaveBeenCalled();
    expect(recording.stopAndStage).toHaveBeenCalledWith(expect.objectContaining({ profileName: 'Sem perfil' }));
  });

  it('stops early and reports an error when no displays are detected', async () => {
    vi.mocked(obs.configureScenes).mockResolvedValue([]);

    await command.run();

    expect(p.log.error).toHaveBeenCalled();
    expect(obs.startRecording).not.toHaveBeenCalled();
  });

  it('cancels cleanly when the profile select is cancelled (Ctrl+C)', async () => {
    const cancelSymbol = Symbol('cancel');
    vi.mocked(p.select).mockResolvedValueOnce(cancelSymbol as never);
    vi.mocked(p.isCancel).mockImplementation((value: unknown) => value === cancelSymbol);

    await command.run();

    expect(p.cancel).toHaveBeenCalled();
    expect(obs.configureScenes).not.toHaveBeenCalled();
  });

  it('cancels cleanly when the microphone confirm is cancelled (Ctrl+C)', async () => {
    const cancelSymbol = Symbol('cancel');
    vi.mocked(p.confirm).mockResolvedValueOnce(cancelSymbol as never);
    vi.mocked(p.isCancel).mockImplementation((value: unknown) => value === cancelSymbol);

    await command.run();

    expect(p.cancel).toHaveBeenCalled();
    expect(obs.startRecording).not.toHaveBeenCalled();
  });

  it('reports an error and never stages the session when obs.stopRecording fails', async () => {
    vi.mocked(obs.stopRecording).mockRejectedValue(new Error('OBS não respondeu'));

    await command.run();

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('OBS não respondeu'));
    expect(recording.stopAndStage).not.toHaveBeenCalled();
  });

  it('reports an error including the video path when staging fails after recording stopped', async () => {
    vi.mocked(recording.stopAndStage).mockRejectedValue(new Error('falha ao mover para outro volume'));

    await command.run();

    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Z:\\MeetingAI\\2026-08-26 14-30-00.mkv'),
    );
    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('falha ao mover para outro volume'));
  });
});
