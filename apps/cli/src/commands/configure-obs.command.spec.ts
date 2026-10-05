import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as p from '@clack/prompts';
import { ConfigureObsCommand } from './configure-obs.command';
import { StorageService } from '@mt/storage';
import { ObsService } from '@mt/obs';
import { MachineConfig, DisplayInfo } from '@mt/domain';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { success: vi.fn(), warn: vi.fn() },
}));

describe('ConfigureObsCommand', () => {
  let command: ConfigureObsCommand;
  let storage: StorageService;
  let obs: ObsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfigureObsCommand,
        { provide: StorageService, useValue: { resolveStorageRoot: vi.fn(), layout: vi.fn(() => ({ recordings: 'Z:\\MeetingAI' })), resolveObsConnection: vi.fn() } },
        { provide: ObsService, useValue: { configureScenes: vi.fn() } },
      ],
    }).compile();

    command = moduleRef.get(ConfigureObsCommand);
    storage = moduleRef.get(StorageService);
    obs = moduleRef.get(ObsService);

    vi.mocked(storage.resolveStorageRoot).mockResolvedValue(new MachineConfig('Z:\\MeetingAI', new Date()));
    vi.mocked(storage.resolveObsConnection).mockReturnValue({ url: undefined, password: undefined });
    vi.mocked(obs.configureScenes).mockResolvedValue([]);
  });

  it('configures scenes using the resolved storage root and reports how many displays were set up', async () => {
    vi.mocked(obs.configureScenes).mockResolvedValue([new DisplayInfo(0, 'Primary'), new DisplayInfo(1, 'Secondary')]);

    await command.run();

    expect(obs.configureScenes).toHaveBeenCalledWith('Z:\\MeetingAI', undefined, undefined);
    expect(p.log.success).toHaveBeenCalledWith('Cenas configuradas para 2 display(s).');
  });

  it('passes whatever StorageService.resolveObsConnection resolves through to configureScenes', async () => {
    vi.mocked(storage.resolveObsConnection).mockReturnValue({
      url: 'ws://192.168.1.10:4455',
      password: 'super-secret',
    });

    await command.run();

    expect(storage.resolveObsConnection).toHaveBeenCalledWith(expect.any(MachineConfig));
    expect(obs.configureScenes).toHaveBeenCalledWith('Z:\\MeetingAI', 'ws://192.168.1.10:4455', 'super-secret');
  });
});
