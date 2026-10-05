import { it, expect, vi, describe } from 'vitest';
import { CommandFactory, CommandRunnerService } from 'nest-commander';
import { CliModule } from '../cli.module';
import { SettingsCommand } from './settings.command';
import { ProcessCommand } from './process.command';
import { PrepareCommand } from './prepare.command';
describe.skipIf(!['darwin', 'win32'].includes(process.platform))('workspace CLI parsing', () => {
  it('preserves paths with spaces and optional processing flags without invoking real services', async () => {
    const app = await CommandFactory.createWithoutRunning(CliModule);
    try {
      const run = vi.spyOn(app.get(ProcessCommand), 'run').mockResolvedValue();
      await app.get(CommandRunnerService).run(['node', 'mt', 'process', '--file', '/disco externo/video.mp4', '--profile', 'Work', '--audio-only', '--register-sc', '--local']);
      expect(run.mock.calls[0][1]).toMatchObject({ file: '/disco externo/video.mp4', profile: 'Work', audioOnly: true, registerSc: true, local: true });
    } finally { await app.close(); }
  });
  it('parses all configurable directories and models independently', async () => {
    const app = await CommandFactory.createWithoutRunning(CliModule);
    try {
      const run = vi.spyOn(app.get(SettingsCommand), 'run').mockResolvedValue();
      await app.get(CommandRunnerService).run(['node', 'mt', 'settings', '--storage-root', '/data', '--migrate', '--config-root', '/config', '--recordings-root', '/videos', '--models-root', '/models', '--reports-root', '/reports', '--create-profile', 'Work', '--create-vault', '/vault', '--whisper-binary', '/bin/whisper', '--whisper-model', '/models/ggml.bin', '--summary-model', 'summary', '--vision-model', 'vision']);
      expect(run.mock.calls[0][1]).toMatchObject({ storageRoot: '/data', migrate: true, configRoot: '/config', recordingsRoot: '/videos', modelsRoot: '/models', reportsRoot: '/reports', createProfile: 'Work', createVault: '/vault', whisperBinary: '/bin/whisper', whisperModel: '/models/ggml.bin', summaryModel: 'summary', visionModel: 'vision' });
    } finally { await app.close(); }
  });
  it('keeps installation explicit and supports audio-only preparation', async () => {
    const app = await CommandFactory.createWithoutRunning(CliModule);
    try {
      const run = vi.spyOn(app.get(PrepareCommand), 'run').mockResolvedValue();
      await app.get(CommandRunnerService).run(['node', 'mt', 'prepare', '--audio-only', '--install-tools']);
      expect(run.mock.calls[0][1]).toMatchObject({ audioOnly: true, installTools: true });
    } finally { await app.close(); }
  });
});
