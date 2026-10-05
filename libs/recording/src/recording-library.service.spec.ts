import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecordingLibraryService } from './recording-library.service';
import { SessionFileRepository } from './session-file.repository';
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-library-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
describe('recording library', () => {
  it('lists directories and videos even without Staging and ignores unrelated files', async () => {
    await fs.mkdir(path.join(root, 'pasta'));
    await fs.writeFile(path.join(root, 'reunião.MP4'), 'video');
    await fs.writeFile(path.join(root, 'notes.md'), 'note');
    const library = new RecordingLibraryService(new SessionFileRepository());
    expect((await library.list(root)).map(item => [item.name, item.directory])).toEqual([['pasta', true], ['reunião.MP4', false]]);
  });
  it('copies arbitrary video into staging, preserves extension and original, and reuses a pending session', async () => {
    const video = path.join(root, 'reunião original.mov'); await fs.writeFile(video, 'video bytes');
    const repo = new SessionFileRepository(); const library = new RecordingLibraryService(repo);
    const session = await library.importVideo(video, root, 'Trabalho');
    expect(session.videoPath).toMatch(/recording\.mov$/);
    expect(await fs.readFile(video, 'utf8')).toBe('video bytes');
    expect(await fs.readFile(session.videoPath, 'utf8')).toBe('video bytes');
    expect((await repo.listPending(root))[0].profileName).toBe('Trabalho');
    expect((await library.importVideo(session.videoPath, root, 'Outro')).sessionId).toBe(session.sessionId);
    await repo.markProcessed(session, root);
    expect(await fs.readFile(video, 'utf8')).toBe('video bytes');
  });
  it('rejects directories and unsupported files before creating a session', async () => {
    const library = new RecordingLibraryService(new SessionFileRepository());
    await fs.writeFile(path.join(root, 'note.txt'), 'hello');
    await expect(library.importVideo(root, root, 'Sem perfil')).rejects.toThrow();
    await expect(library.importVideo(path.join(root, 'note.txt'), root, 'Sem perfil')).rejects.toThrow('vídeo');
    expect(await new SessionFileRepository().listPending(root)).toEqual([]);
  });
});
