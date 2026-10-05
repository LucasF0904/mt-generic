import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as p from '@clack/prompts';
import { SetupCommand } from './setup.command';
import { StorageService } from '@mt/storage';
import { EnvironmentSetupService } from '@mt/setup';
import { ObsService } from '@mt/obs';
import { CURRENT_PLATFORM } from '@mt/platform';
import { MachineConfig } from '@mt/domain';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { success: vi.fn(), warn: vi.fn(), info: vi.fn() },
  confirm: vi.fn(),
}));

describe('SetupCommand', () => {
  let command: SetupCommand;
  let storage: StorageService;
  let env: EnvironmentSetupService;
  let obs: ObsService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.MT_OBS_URL;
    delete process.env.MT_OBS_PASSWORD;

    const moduleRef = await Test.createTestingModule({
      providers: [
        SetupCommand,
        {
          provide: StorageService,
          useValue: { resolveStorageRoot: vi.fn(), layout: vi.fn(() => ({ recordings: 'Z:\\MeetingAI' })), resolveObsConnection: vi.fn(), saveObsConnection: vi.fn() },
        },
        {
          provide: EnvironmentSetupService,
          useValue: {
            checkFfmpeg: vi.fn(),
            checkOllama: vi.fn(),
            checkWhisperCpp: vi.fn(),
            whisperCliPath: vi.fn((root: string) => `${root}\\bin\\whisper-cli.exe`),
            pullOllamaModels: vi.fn(),
          },
        },
        { provide: ObsService, useValue: { testConnection: vi.fn(), configureScenes: vi.fn().mockResolvedValue([]) } },
        { provide: CURRENT_PLATFORM, useValue: 'windows' },
      ],
    }).compile();

    command = moduleRef.get(SetupCommand);
    storage = moduleRef.get(StorageService);
    env = moduleRef.get(EnvironmentSetupService);
    obs = moduleRef.get(ObsService);

    vi.mocked(storage.resolveStorageRoot).mockResolvedValue(new MachineConfig('Z:\\MeetingAI', new Date()));
    vi.mocked(storage.resolveObsConnection).mockReturnValue({ url: undefined, password: undefined });
    vi.mocked(env.checkFfmpeg).mockResolvedValue(true);
    vi.mocked(env.checkOllama).mockResolvedValue(true);
    vi.mocked(env.checkWhisperCpp).mockResolvedValue(true);
    vi.mocked(obs.testConnection).mockResolvedValue(true);
    vi.mocked(p.confirm).mockResolvedValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('configures the detected displays during setup', async () => {
    await command.run([], { skipModelPull: true });
    expect(obs.configureScenes).toHaveBeenCalledWith('Z:\\MeetingAI', undefined, undefined);
  });

  it('reports the detected platform', async () => {
    await command.run();

    expect(p.log.info).toHaveBeenCalledWith('Plataforma: Windows');
  });

  it('points at the whisper.cpp path from the setup service when the binary is missing', async () => {
    vi.mocked(env.checkWhisperCpp).mockResolvedValue(false);

    await command.run();

    expect(env.whisperCliPath).toHaveBeenCalledWith('Z:\\MeetingAI');
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('Z:\\MeetingAI\\bin\\whisper-cli.exe'));
  });

  it('resolves the storage root before checking dependencies', async () => {
    const callOrder: string[] = [];
    vi.mocked(storage.resolveStorageRoot).mockImplementation(async () => {
      callOrder.push('resolveStorageRoot');
      return new MachineConfig('Z:\\MeetingAI', new Date());
    });
    vi.mocked(env.checkFfmpeg).mockImplementation(async () => {
      callOrder.push('checkFfmpeg');
      return true;
    });

    await command.run();

    expect(callOrder).toEqual(['resolveStorageRoot', 'checkFfmpeg']);
  });

  it('pulls Ollama models only when Ollama is present and the user confirms', async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);

    await command.run();

    expect(env.pullOllamaModels).toHaveBeenCalledWith(['llama3.2:3b', 'qwen2.5vl'], 'Z:\\MeetingAI');
  });

  it('does not offer to pull Ollama models when Ollama is missing', async () => {
    vi.mocked(env.checkOllama).mockResolvedValue(false);

    await command.run();

    expect(p.confirm).not.toHaveBeenCalled();
    expect(env.pullOllamaModels).not.toHaveBeenCalled();
  });

  it('skips pulling models when the user declines', async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);

    await command.run();

    expect(env.pullOllamaModels).not.toHaveBeenCalled();
  });

  it('pulls Ollama models without prompting when --pull-models is passed', async () => {
    await command.run([], { pullModels: true });

    expect(p.confirm).not.toHaveBeenCalled();
    expect(env.pullOllamaModels).toHaveBeenCalledWith(['llama3.2:3b', 'qwen2.5vl'], 'Z:\\MeetingAI');
  });

  it('skips pulling models without prompting when --skip-model-pull is passed', async () => {
    await command.run([], { skipModelPull: true });

    expect(p.confirm).not.toHaveBeenCalled();
    expect(env.pullOllamaModels).not.toHaveBeenCalled();
  });

  it('resolves the storage root without forcing a re-scan when --relocate-storage is not passed', async () => {
    await command.run();

    expect(storage.resolveStorageRoot).toHaveBeenCalledWith({ force: false });
  });

  it('forces a storage re-scan when --relocate-storage is passed', async () => {
    await command.run([], { relocateStorage: true });

    expect(storage.resolveStorageRoot).toHaveBeenCalledWith({ force: true });
  });

  it('tests the OBS connection with whatever StorageService.resolveObsConnection resolves', async () => {
    vi.mocked(storage.resolveObsConnection).mockReturnValue({
      url: 'ws://192.168.1.10:4455',
      password: 'cached-secret',
    });

    await command.run();

    expect(storage.resolveObsConnection).toHaveBeenCalledWith(expect.any(MachineConfig));
    expect(obs.testConnection).toHaveBeenCalledWith('ws://192.168.1.10:4455', 'cached-secret');
  });

  it('lets --obs-url/--obs-password override the cached connection', async () => {
    vi.mocked(storage.resolveObsConnection).mockReturnValue({
      url: 'ws://cached:4455',
      password: 'cached-secret',
    });

    await command.run([], { obsUrl: 'ws://override:4455', obsPassword: 'override-secret' });

    expect(obs.testConnection).toHaveBeenCalledWith('ws://override:4455', 'override-secret');
  });

  it('saves the OBS connection when --obs-password is passed and the connection works', async () => {
    vi.mocked(storage.saveObsConnection).mockResolvedValue(new MachineConfig('Z:\\MeetingAI', new Date()));

    await command.run([], { obsPassword: 'new-secret' });

    expect(storage.saveObsConnection).toHaveBeenCalledWith(expect.any(MachineConfig), {
      url: undefined,
      password: 'new-secret',
    });
    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining('Conexão com o OBS salva'));
  });

  it('does not save the OBS connection when the connection fails', async () => {
    vi.mocked(obs.testConnection).mockResolvedValue(false);

    await command.run([], { obsPassword: 'wrong-secret' });

    expect(storage.saveObsConnection).not.toHaveBeenCalled();
  });

  it('does not save the OBS connection when neither --obs-url nor --obs-password was passed', async () => {
    await command.run();

    expect(storage.saveObsConnection).not.toHaveBeenCalled();
  });
});
