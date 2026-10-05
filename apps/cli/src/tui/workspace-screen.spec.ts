import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as blessed from 'blessed';
import { it, expect, vi } from 'vitest';
import { WorkspaceScreen } from './workspace-screen';
it('keeps keyboard navigation alive across record, stop and transcription, restoring terminal on quit', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; } });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 36 }); output.resume();
  const controller = Object.assign(new EventEmitter(), {
    state: { phase: 'idle', directory: '/recordings', entries: [{ name: 'meeting.mkv', path: '/recordings/meeting.mkv', directory: false, size: 20, modifiedAt: new Date() }], selectedPath: '/recordings/meeting.mkv', registerSc: false, profiles: [], displays: [], profileName: 'Sem perfil', status: 'Pronto', messages: [] },
    initialize: vi.fn(), log: vi.fn(), select: vi.fn(), setOptions: vi.fn(),
    startRecording: vi.fn(async () => { controller.state.phase = 'recording'; controller.emit('change'); }),
    stopRecording: vi.fn(async () => { controller.state.phase = 'idle'; controller.emit('change'); }),
    transcribeSelected: vi.fn(),
  });
  const screen = blessed.screen({ input: input as any, output: output as any, terminal: 'xterm-256color', smartCSR: false });
  const ui = new WorkspaceScreen(controller as any, {}, () => screen);
  const running = ui.run();
  try {
    await vi.waitFor(() => expect(controller.initialize).toHaveBeenCalled());
    input.write('g'); await vi.waitFor(() => expect(controller.setOptions).toHaveBeenCalledWith({ registerSc: true }));
    input.write('r'); await vi.waitFor(() => expect(controller.startRecording).toHaveBeenCalledTimes(1));
    input.write('s'); await vi.waitFor(() => expect(controller.stopRecording).toHaveBeenCalledTimes(1));
    input.write('t'); await vi.waitFor(() => expect(controller.transcribeSelected).toHaveBeenCalledTimes(1));
    input.write('q'); await running;
    expect(input.isRaw).toBe(false);
    expect(screen.destroyed).toBe(true);
  } finally { if (!screen.destroyed) screen.destroy(); input.destroy(); output.destroy(); }
});

it('restores exclusive input after an assistant and allows folder navigation without duplicate commands', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; } });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 30 }); output.resume();
  const screens: blessed.Widgets.Screen[] = [];
  const controller = Object.assign(new EventEmitter(), {
    state: { phase: 'idle', directory: '/videos', entries: [{ name: 'folder', path: '/videos/folder', directory: true, size: 0 }], selectedPath: '/videos/folder', profiles: [], displays: [], profileName: 'Sem perfil', status: '', messages: [] },
    initialize: vi.fn(), log: vi.fn(), select: vi.fn(), setOptions: vi.fn(),
    browse: vi.fn(async (directory: string) => { controller.state.directory = directory; controller.emit('change'); }),
  });
  const assistant = vi.fn(async () => { expect(screens[0].destroyed).toBe(true); expect(input.isRaw).toBe(false); });
  const ui = new WorkspaceScreen(controller as any, { settings: assistant }, () => {
    const screen = blessed.screen({ input: input as any, output: output as any, terminal: 'xterm-256color' }); screens.push(screen); return screen;
  });
  const running = ui.run();
  try {
    await vi.waitFor(() => expect(controller.initialize).toHaveBeenCalledTimes(1));
    input.write('c'); await vi.waitFor(() => expect(controller.initialize).toHaveBeenCalledTimes(2));
    expect(assistant).toHaveBeenCalledTimes(1); expect(input.isRaw).toBe(true);
    input.write('\r'); await vi.waitFor(() => expect(controller.browse).toHaveBeenCalledTimes(1));
    expect(controller.browse).toHaveBeenCalledWith('/videos/folder');
    input.write('/');
    await new Promise(resolve => setImmediate(resolve));
    input.write('/child\r');
    await vi.waitFor(() => expect(controller.browse).toHaveBeenCalledTimes(2));
    expect(controller.browse).toHaveBeenLastCalledWith('/videos/folder/child');
    input.write('q'); await running; expect(input.isRaw).toBe(false);
  } finally { screens.forEach(screen => { if (!screen.destroyed) screen.destroy(); }); input.destroy(); output.destroy(); }
});
