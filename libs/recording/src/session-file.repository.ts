import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { AudioMode, RecordingSession, SessionRepository, StageSessionParams } from '@mt/domain';

interface SessionJson {
  sessionId: string;
  profileName: string;
  displayIndex: number;
  audioMode: AudioMode;
  recordedAt: string;
  videoPath: string;
  inputEventsPath?: string;
}

// A single unreadable/invalid entry under Staging/ should be skipped, not abort
// the whole listing: a locked dir (EACCES), a stray file where a folder is
// expected (ENOTDIR), a missing/half-written session.json (ENOENT), or corrupt
// JSON (SyntaxError).
const SKIPPABLE_ENTRY_CODES = new Set(['ENOENT', 'ENOTDIR', 'EACCES']);

export class SessionFileRepository implements SessionRepository {
  async stage(params: StageSessionParams): Promise<RecordingSession> {
    const recordedAt = new Date();
    const sessionId = recordedAt.toISOString().replace(/[:.]/g, '-');
    const sessionDir = path.join(params.storageRoot, 'Staging', sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const videoPath = path.join(sessionDir, 'recording.mkv');
    await fs.rename(params.sourceVideoPath, videoPath);

    const inputEventsPath = await this.moveInputEvents(params.inputEventsPath, sessionDir);

    const session = new RecordingSession(
      sessionId,
      params.profileName,
      params.displayIndex,
      params.audioMode,
      recordedAt,
      videoPath,
      inputEventsPath,
    );

    await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(this.toJson(session), null, 2), 'utf-8');

    return session;
  }

  /** Moves the logger's output into the session dir; missing/never-produced logs are not fatal. */
  private async moveInputEvents(sourcePath: string | undefined, sessionDir: string): Promise<string | undefined> {
    if (!sourcePath) {
      return undefined;
    }
    const destination = path.join(sessionDir, 'input-events.jsonl');
    try {
      await fs.rename(sourcePath, destination);
      return destination;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async listPending(storageRoot: string): Promise<RecordingSession[]> {
    const stagingDir = path.join(storageRoot, 'Staging');
    let entries: string[];
    try {
      entries = await fs.readdir(stagingDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const sessions: RecordingSession[] = [];
    for (const entry of entries) {
      const sessionJsonPath = path.join(stagingDir, entry, 'session.json');
      let parsed: SessionJson;
      try {
        parsed = JSON.parse(await fs.readFile(sessionJsonPath, 'utf-8')) as SessionJson;
      } catch (error) {
        if (error instanceof SyntaxError || SKIPPABLE_ENTRY_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
          continue;
        }
        throw error;
      }
      sessions.push(this.fromJson(parsed));
    }
    return sessions;
  }

  async markProcessed(session: RecordingSession, storageRoot: string): Promise<void> {
    const from = path.join(storageRoot, 'Staging', session.sessionId);
    const processedRoot = path.join(storageRoot, 'Processed');
    const to = path.join(processedRoot, session.sessionId);

    await fs.mkdir(processedRoot, { recursive: true });
    await fs.rename(from, to);
    await this.rewriteMovedPaths(from, to);
  }

  /** Repoints videoPath/inputEventsPath in the moved session.json so neither references Staging/ anymore. */
  private async rewriteMovedPaths(previousDir: string, currentDir: string): Promise<void> {
    const sessionJsonPath = path.join(currentDir, 'session.json');
    let parsed: SessionJson;
    try {
      parsed = JSON.parse(await fs.readFile(sessionJsonPath, 'utf-8')) as SessionJson;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const rebase = (value: string | undefined): string | undefined =>
      value && value.startsWith(previousDir + path.sep)
        ? path.join(currentDir, path.relative(previousDir, value))
        : value;

    const rebasedVideoPath = rebase(parsed.videoPath);
    const rebasedInputEventsPath = rebase(parsed.inputEventsPath);
    if (rebasedVideoPath === parsed.videoPath && rebasedInputEventsPath === parsed.inputEventsPath) {
      return;
    }

    parsed.videoPath = rebasedVideoPath as string;
    parsed.inputEventsPath = rebasedInputEventsPath;
    await fs.writeFile(sessionJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
  }

  private toJson(session: RecordingSession): SessionJson {
    return {
      sessionId: session.sessionId,
      profileName: session.profileName,
      displayIndex: session.displayIndex,
      audioMode: session.audioMode,
      recordedAt: session.recordedAt.toISOString(),
      videoPath: session.videoPath,
      inputEventsPath: session.inputEventsPath,
    };
  }

  private fromJson(parsed: SessionJson): RecordingSession {
    return new RecordingSession(
      parsed.sessionId,
      parsed.profileName,
      parsed.displayIndex,
      parsed.audioMode,
      new Date(parsed.recordedAt),
      parsed.videoPath,
      parsed.inputEventsPath,
    );
  }
}
