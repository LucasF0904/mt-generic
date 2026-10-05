import { Inject, Injectable } from '@nestjs/common';
import { constants, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { AudioMode, RecordingSession, SessionRepository, SESSION_REPOSITORY } from '@mt/domain';

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.mov', '.webm', '.avi', '.m4v', '.flv', '.ts']);
export interface RecordingEntry { name: string; path: string; directory: boolean; size: number; modifiedAt: Date; }

@Injectable()
export class RecordingLibraryService {
  constructor(@Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository) {}

  async list(directory: string): Promise<RecordingEntry[]> {
    const entries = await fs.readdir(path.resolve(directory), { withFileTypes: true });
    const results = await Promise.all(entries.filter(entry => !entry.name.startsWith('.')).map(async entry => {
      const filePath = path.resolve(directory, entry.name);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isDirectory() && (!stat.isFile() || !VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))) return undefined;
        return { name: entry.name, path: filePath, directory: stat.isDirectory(), size: stat.size, modifiedAt: stat.mtime };
      } catch { return undefined; } // A removed/unreadable entry needn't hide the rest of a folder.
    }));
    return results.filter((entry): entry is RecordingEntry => entry !== undefined).sort((a, b) =>
      Number(b.directory) - Number(a.directory) || (a.directory ? a.name.localeCompare(b.name) : b.modifiedAt.getTime() - a.modifiedAt.getTime() || a.name.localeCompare(b.name)));
  }

  async importVideo(filePath: string, storageRoot: string, profileName: string): Promise<RecordingSession> {
    const source = await fs.realpath(path.resolve(filePath));
    const stat = await fs.stat(source);
    if (!stat.isFile() || !VIDEO_EXTENSIONS.has(path.extname(source).toLowerCase())) throw new Error('Selecione um arquivo de vídeo (mkv, mp4, mov, webm, avi, m4v, flv ou ts).');
    const pending = await this.sessions.listPending(storageRoot);
    for (const session of pending) {
      try { if (await fs.realpath(session.videoPath) === source) return session; } catch { /* Missing session video. */ }
    }
    const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const directory = path.join(storageRoot, 'Staging', sessionId);
    await fs.mkdir(directory, { recursive: true });
    try {
      const videoPath = path.join(directory, `recording${path.extname(source).toLowerCase()}`);
      // COPYFILE_FICLONE uses a copy-on-write clone when available; otherwise copies normally.
      await fs.copyFile(source, videoPath, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
      const session = new RecordingSession(sessionId, profileName, 0, AudioMode.Meeting, stat.mtime, videoPath);
      await fs.writeFile(path.join(directory, 'session.json'), JSON.stringify({ ...session, sourceVideoPath: source }, null, 2), { flag: 'wx' });
      return session;
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}
