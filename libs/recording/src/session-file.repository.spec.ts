import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { SessionFileRepository } from './session-file.repository';
import { AudioMode, RecordingSession } from '@mt/domain';

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(),
    rename: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe('SessionFileRepository', () => {
  let repo: SessionFileRepository;

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(fs.rename).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    repo = new SessionFileRepository();
  });

  describe('stage', () => {
    it('creates the session directory, moves the video, writes session.json, and returns the session', async () => {
      const session = await repo.stage({
        profileName: 'demo',
        displayIndex: 0,
        audioMode: AudioMode.MeetingWithMic,
        sourceVideoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
        storageRoot: 'Z:\\MeetingAI',
      });

      expect(session.profileName).toBe('demo');
      expect(session.displayIndex).toBe(0);
      expect(session.audioMode).toBe(AudioMode.MeetingWithMic);
      const sessionDir = path.join('Z:\\MeetingAI', 'Staging', session.sessionId);
      expect(session.videoPath).toBe(path.join(sessionDir, 'recording.mkv'));

      expect(fs.mkdir).toHaveBeenCalledWith(sessionDir, { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith(
        'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
        path.join(sessionDir, 'recording.mkv'),
      );

      const [writtenPath, writtenContent] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writtenPath).toBe(path.join(sessionDir, 'session.json'));
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.sessionId).toBe(session.sessionId);
      expect(parsed.profileName).toBe('demo');
      expect(parsed.displayIndex).toBe(0);
      expect(parsed.audioMode).toBe(AudioMode.MeetingWithMic);
      expect(parsed.videoPath).toBe(session.videoPath);
      expect(new Date(parsed.recordedAt).toISOString()).toBe(parsed.recordedAt);
    });

    it('also moves the input-events log into the session dir when one was produced', async () => {
      const session = await repo.stage({
        profileName: 'demo',
        displayIndex: 0,
        audioMode: AudioMode.Meeting,
        sourceVideoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
        storageRoot: 'Z:\\MeetingAI',
        inputEventsPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl',
      });

      const sessionDir = path.join('Z:\\MeetingAI', 'Staging', session.sessionId);
      const expectedDest = path.join(sessionDir, 'input-events.jsonl');
      expect(fs.rename).toHaveBeenCalledWith('Z:\\MeetingAI\\.tmp\\input-abc.jsonl', expectedDest);
      expect(session.inputEventsPath).toBe(expectedDest);

      const [, writtenContent] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(JSON.parse(writtenContent as string).inputEventsPath).toBe(expectedDest);
    });

    it('stages without inputEventsPath when the input log never materialized (logger crashed)', async () => {
      vi.mocked(fs.rename).mockImplementation(async (from) => {
        if (String(from).includes('.tmp')) {
          throw Object.assign(new Error('gone'), { code: 'ENOENT' });
        }
      });

      const session = await repo.stage({
        profileName: 'demo',
        displayIndex: 0,
        audioMode: AudioMode.Meeting,
        sourceVideoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
        storageRoot: 'Z:\\MeetingAI',
        inputEventsPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl',
      });

      expect(session.inputEventsPath).toBeUndefined();
    });
  });

  describe('listPending', () => {
    it('returns an empty array when the Staging directory does not exist', async () => {
      const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
      vi.mocked(fs.readdir).mockRejectedValue(error);

      await expect(repo.listPending('Z:\\MeetingAI')).resolves.toEqual([]);
    });

    it('parses every session.json found under Staging/*/', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['session-a', 'session-b'] as never);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const id = String(filePath).includes('session-a') ? 'session-a' : 'session-b';
        return JSON.stringify({
          sessionId: id,
          profileName: 'demo',
          displayIndex: 0,
          audioMode: AudioMode.Meeting,
          recordedAt: '2026-08-26T14:30:00.000Z',
          videoPath: `Z:\\MeetingAI\\Staging\\${id}\\recording.mkv`,
        });
      });

      const sessions = await repo.listPending('Z:\\MeetingAI');

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.sessionId).sort()).toEqual(['session-a', 'session-b']);
      expect(sessions[0].recordedAt).toBeInstanceOf(Date);
    });

    it('skips an entry whose session.json is missing, without throwing', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['incomplete-session'] as never);
      const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(repo.listPending('Z:\\MeetingAI')).resolves.toEqual([]);
    });

    it('skips locked (EACCES), non-directory (ENOTDIR) and corrupt-JSON entries instead of aborting', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['locked', 'stray-file', 'corrupt', 'good'] as never);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const name = String(filePath);
        if (name.includes('locked')) throw Object.assign(new Error('perm'), { code: 'EACCES' });
        if (name.includes('stray-file')) throw Object.assign(new Error('not a dir'), { code: 'ENOTDIR' });
        if (name.includes('corrupt')) return '{ not json';
        return JSON.stringify({
          sessionId: 'good',
          profileName: 'demo',
          displayIndex: 0,
          audioMode: AudioMode.Meeting,
          recordedAt: '2026-08-26T14:30:00.000Z',
          videoPath: 'irrelevant',
        });
      });

      const sessions = await repo.listPending('Z:\\MeetingAI');

      expect(sessions.map((s) => s.sessionId)).toEqual(['good']);
    });

    it('rethrows an unexpected error from a Staging entry', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['weird'] as never);
      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('disk on fire'), { code: 'EIO' }));

      await expect(repo.listPending('Z:\\MeetingAI')).rejects.toThrow('disk on fire');
    });
  });

  describe('markProcessed', () => {
    const posixRoot = '/srv/MeetingAI';
    const stagedSession = new RecordingSession(
      'session-a',
      'demo',
      0,
      AudioMode.Meeting,
      new Date('2026-08-26T14:30:00.000Z'),
      path.join(posixRoot, 'Staging', 'session-a', 'recording.mkv'),
    );
    const stagedJson = JSON.stringify({
      sessionId: 'session-a',
      profileName: 'demo',
      displayIndex: 0,
      audioMode: AudioMode.Meeting,
      recordedAt: '2026-08-26T14:30:00.000Z',
      videoPath: path.join(posixRoot, 'Staging', 'session-a', 'recording.mkv'),
    });

    it('moves the session directory from Staging to Processed', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(stagedJson as never);

      await repo.markProcessed(stagedSession, posixRoot);

      expect(fs.mkdir).toHaveBeenCalledWith(path.join(posixRoot, 'Processed'), { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith(
        path.join(posixRoot, 'Staging', 'session-a'),
        path.join(posixRoot, 'Processed', 'session-a'),
      );
    });

    it('repoints videoPath in the moved session.json from Staging to Processed', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(stagedJson as never);

      await repo.markProcessed(stagedSession, posixRoot);

      const [writtenPath, writtenContent] = vi.mocked(fs.writeFile).mock.calls.at(-1)!;
      expect(writtenPath).toBe(path.join(posixRoot, 'Processed', 'session-a', 'session.json'));
      expect(JSON.parse(writtenContent as string).videoPath).toBe(
        path.join(posixRoot, 'Processed', 'session-a', 'recording.mkv'),
      );
    });

    it('also repoints inputEventsPath when the session has one', async () => {
      const jsonWithInputLog = JSON.stringify({
        sessionId: 'session-a',
        profileName: 'demo',
        displayIndex: 0,
        audioMode: AudioMode.Meeting,
        recordedAt: '2026-08-26T14:30:00.000Z',
        videoPath: path.join(posixRoot, 'Staging', 'session-a', 'recording.mkv'),
        inputEventsPath: path.join(posixRoot, 'Staging', 'session-a', 'input-events.jsonl'),
      });
      vi.mocked(fs.readFile).mockResolvedValue(jsonWithInputLog as never);

      await repo.markProcessed(stagedSession, posixRoot);

      const [, writtenContent] = vi.mocked(fs.writeFile).mock.calls.at(-1)!;
      expect(JSON.parse(writtenContent as string).inputEventsPath).toBe(
        path.join(posixRoot, 'Processed', 'session-a', 'input-events.jsonl'),
      );
    });

    it('leaves the JSON alone when the moved session.json is gone', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));

      await expect(repo.markProcessed(stagedSession, posixRoot)).resolves.toBeUndefined();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
