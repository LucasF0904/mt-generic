import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { readInputEvents } from './input-events-reader';

vi.mock('node:fs', () => ({ promises: { readFile: vi.fn() } }));

describe('readInputEvents', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
  });

  it('returns an empty array when no path is given', async () => {
    await expect(readInputEvents(undefined)).resolves.toEqual([]);
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('returns an empty array when the file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));

    await expect(readInputEvents('/srv/S/input-events.jsonl')).resolves.toEqual([]);
  });

  it('rethrows an unexpected read error', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('disk on fire'), { code: 'EIO' }));

    await expect(readInputEvents('/srv/S/input-events.jsonl')).rejects.toThrow('disk on fire');
  });

  it('parses one InputEvent per JSONL line, skipping blank lines', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      [
        JSON.stringify({ kind: 'click', timestamp: '2026-09-03T21:30:01.000Z', data: { x: 10, y: 20, button: 1 } }),
        '',
        JSON.stringify({ kind: 'window', timestamp: '2026-09-03T21:30:02.000Z', data: { appName: 'OBS', title: '' } }),
      ].join('\n') as never,
    );

    const events = await readInputEvents('/srv/S/input-events.jsonl');

    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('click');
    expect(events[0].data).toEqual({ x: 10, y: 20, button: 1 });
    expect(events[1].kind).toBe('window');
    expect(events[1].timestamp).toEqual(new Date('2026-09-03T21:30:02.000Z'));
  });

  it('skips a corrupt line instead of throwing', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      ['{ not json', JSON.stringify({ kind: 'click', timestamp: '2026-09-03T21:30:01.000Z', data: {} })].join(
        '\n',
      ) as never,
    );

    const events = await readInputEvents('/srv/S/input-events.jsonl');

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('click');
  });

  it('skips a line whose timestamp is not a valid date', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ kind: 'click', timestamp: 'not-a-date', data: {} }) as never,
    );

    await expect(readInputEvents('/srv/S/input-events.jsonl')).resolves.toEqual([]);
  });
});
