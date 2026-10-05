import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { it, expect, vi } from 'vitest';
import { CliAssistantService } from './cli-assistant.service';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
it('runs assistants with exclusive inherited terminal IO and propagates their completion', async () => {
  const child = new EventEmitter(); vi.mocked(spawn).mockReturnValue(child as any);
  const runtime = { reset: vi.fn() }; const service = new CliAssistantService(runtime as any);
  const done = service.run('settings');
  expect(runtime.reset).toHaveBeenCalledOnce();
  expect(spawn).toHaveBeenCalledWith(process.execPath, [process.argv[1], 'settings'], { stdio: 'inherit' });
  child.emit('exit', 0, null); await done;
  const failed = service.run('prepare');
  const rejection = expect(failed).rejects.toThrow('código 1');
  child.emit('exit', 1, null); await rejection;
});
