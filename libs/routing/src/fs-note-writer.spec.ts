import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FsNoteWriter } from './fs-note-writer';

vi.mock('node:fs', () => ({
  promises: { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
}));

describe('FsNoteWriter', () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockClear();
    vi.mocked(fs.writeFile).mockClear();
  });

  it('creates the parent directory before writing the note as utf-8', async () => {
    const filePath = path.join('/vault', 'Meetings', 'session-a.md');

    await new FsNoteWriter().write(filePath, '# nota');

    expect(fs.mkdir).toHaveBeenCalledWith(path.join('/vault', 'Meetings'), { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(filePath, '# nota', 'utf-8');
  });
});
