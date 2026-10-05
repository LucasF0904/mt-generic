import { describe, expect, it, vi } from 'vitest';
import { CommandFactory, CommandRunnerService } from 'nest-commander';
import { CliModule } from '../cli.module';
import { RecordCommand } from './record.command';

// Exercise the real decorator discovery + Commander parser. Negated options
// registered before their positive counterpart implicitly default to true.
describe.skipIf(!['darwin', 'win32'].includes(process.platform))('record CLI options', () => {
  it.each([
    { flags: [], mic: undefined, captureKeys: undefined },
    { flags: ['--no-mic', '--no-capture-keys'], mic: false, captureKeys: false },
    { flags: ['--mic', '--capture-keys'], mic: true, captureKeys: true },
  ])('requires an explicit choice for microphone and raw keys: $flags', async ({ flags, mic, captureKeys }) => {
    const app = await CommandFactory.createWithoutRunning(CliModule);
    try {
      const run = vi.spyOn(app.get(RecordCommand), 'run').mockResolvedValue(undefined);
      await app.get(CommandRunnerService).run(['node', 'mt', 'record', ...flags]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][1]?.mic).toBe(mic);
      expect(run.mock.calls[0][1]?.captureKeys).toBe(captureKeys);
    } finally { await app.close(); }
  });
});
