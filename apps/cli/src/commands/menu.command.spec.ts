import { describe, it, expect, vi, afterEach } from 'vitest';
import { MenuCommand } from './menu.command';
vi.mock('@clack/prompts', () => ({ intro: vi.fn(), log: { info: vi.fn(), warn: vi.fn() } }));
const originalIn = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalOut = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
afterEach(() => {
  if (originalIn) Object.defineProperty(process.stdin, 'isTTY', originalIn); else delete (process.stdin as any).isTTY;
  if (originalOut) Object.defineProperty(process.stdout, 'isTTY', originalOut); else delete (process.stdout as any).isTTY;
});
describe('MenuCommand', () => {
  it('opens the persistent dashboard with settings and preparation callbacks', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const assistants = { run: vi.fn() }; const terminal = { run: vi.fn() };
    const command = new MenuCommand({ resolveStorageRoot: async () => ({ preferences: { initialized: true } }) } as any, {} as any, {} as any, assistants as any, terminal as any);
    await command.run();
    expect(terminal.run).toHaveBeenCalledOnce();
    const callbacks = terminal.run.mock.calls[0][0]; await callbacks.settings(); await callbacks.prepare();
    expect(assistants.run).toHaveBeenCalledWith('settings'); expect(assistants.run).toHaveBeenCalledWith('prepare');
  });
  it('rejects redirected input instead of opening a dashboard that cannot accept keys', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const command = new MenuCommand({} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(command.run()).rejects.toThrow('terminal interativo');
  });
});
