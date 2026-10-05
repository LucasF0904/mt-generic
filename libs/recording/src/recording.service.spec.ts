import { describe, expect, it, vi } from 'vitest';
import { RecordingService } from './recording.service';
import { AudioMode, RecordingSession, SessionRepository } from '@mt/domain';
import { InputLogger } from './input-logger';

const makeSessions = (staged: RecordingSession): SessionRepository => ({
  stage: vi.fn().mockResolvedValue(staged),
  listPending: vi.fn(),
  markProcessed: vi.fn(),
});

describe('RecordingService', () => {
  const staged = new RecordingSession(
    '2026-08-26T14-30-00-000Z',
    'demo',
    0,
    AudioMode.Meeting,
    new Date('2026-08-26T14:30:00.000Z'),
    'Z:\\MeetingAI\\Staging\\2026-08-26T14-30-00-000Z\\recording.mkv',
  );

  it('delegates to SessionRepository.stage with the video path mapped to sourceVideoPath', async () => {
    const sessions = makeSessions(staged);
    const inputLogger: InputLogger = { start: vi.fn() };
    const service = new RecordingService(sessions, inputLogger);

    const result = await service.stopAndStage({
      profileName: 'demo',
      displayIndex: 0,
      audioMode: AudioMode.Meeting,
      videoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
      storageRoot: 'Z:\\MeetingAI',
    });

    expect(sessions.stage).toHaveBeenCalledWith({
      profileName: 'demo',
      displayIndex: 0,
      audioMode: AudioMode.Meeting,
      sourceVideoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
      storageRoot: 'Z:\\MeetingAI',
      inputEventsPath: undefined,
    });
    expect(result).toBe(staged);
  });

  it('forwards inputEventsPath through to SessionRepository.stage when given', async () => {
    const sessions = makeSessions(staged);
    const inputLogger: InputLogger = { start: vi.fn() };
    const service = new RecordingService(sessions, inputLogger);

    await service.stopAndStage({
      profileName: 'demo',
      displayIndex: 0,
      audioMode: AudioMode.Meeting,
      videoPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv',
      storageRoot: 'Z:\\MeetingAI',
      inputEventsPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl',
    });

    expect(sessions.stage).toHaveBeenCalledWith(
      expect.objectContaining({ inputEventsPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl' }),
    );
  });

  it('delegates startInputLogging to the InputLogger port', async () => {
    const sessions = makeSessions(staged);
    const handle = { stop: vi.fn() };
    const inputLogger: InputLogger = {
      start: vi.fn().mockResolvedValue({ handle, outputPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl' }),
    };
    const service = new RecordingService(sessions, inputLogger);

    const result = await service.startInputLogging(true, 'Z:\\MeetingAI');

    expect(inputLogger.start).toHaveBeenCalledWith({ captureRawKeys: true }, 'Z:\\MeetingAI');
    expect(result).toEqual({ handle, outputPath: 'Z:\\MeetingAI\\.tmp\\input-abc.jsonl' });
  });
});
