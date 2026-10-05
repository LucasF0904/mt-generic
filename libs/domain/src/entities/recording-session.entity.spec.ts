import { describe, expect, it } from 'vitest';
import { RecordingSession } from './recording-session.entity';
import { AudioMode } from '../value-objects/audio-mode.value-object';

describe('RecordingSession', () => {
  it('stores all fields as given', () => {
    const recordedAt = new Date('2026-08-26T14:30:00.000Z');
    const session = new RecordingSession(
      '2026-08-26T14-30-00-000Z',
      'demo',
      0,
      AudioMode.MeetingWithMic,
      recordedAt,
      'Z:\\MeetingAI\\Staging\\2026-08-26T14-30-00-000Z\\recording.mkv',
    );

    expect(session.sessionId).toBe('2026-08-26T14-30-00-000Z');
    expect(session.profileName).toBe('demo');
    expect(session.displayIndex).toBe(0);
    expect(session.audioMode).toBe(AudioMode.MeetingWithMic);
    expect(session.recordedAt).toBe(recordedAt);
    expect(session.videoPath).toBe('Z:\\MeetingAI\\Staging\\2026-08-26T14-30-00-000Z\\recording.mkv');
  });

  it('rejects an empty sessionId', () => {
    expect(
      () => new RecordingSession('', 'demo', 0, AudioMode.Meeting, new Date(), 'Z:\\video.mkv'),
    ).toThrow('RecordingSession.sessionId must not be empty');
  });
});
