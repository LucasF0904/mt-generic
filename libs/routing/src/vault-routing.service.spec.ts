import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { AudioMode, MeetingNote, Profile, RecordingSession, Transcript, TranscriptSegment } from '@mt/domain';
import { ProfileService } from '@mt/profiles';
import { VaultRoutingService } from './vault-routing.service';
import { NoteWriter } from './note-writer';

const session = new RecordingSession(
  '2026-09-03T20-00-00-000Z',
  'equipe',
  0,
  AudioMode.Meeting,
  new Date('2026-09-03T20:00:00.000Z'),
  path.join('/srv/MeetingAI', 'Staging', '2026-09-03T20-00-00-000Z', 'recording.mkv'),
);
const note = new MeetingNote('resumo', ['ponto'], [], [], []);

describe('VaultRoutingService', () => {
  let profiles: ProfileService;
  let writer: NoteWriter;
  let service: VaultRoutingService;

  beforeEach(() => {
    profiles = { listAvailableProfiles: vi.fn() } as unknown as ProfileService;
    writer = { write: vi.fn().mockResolvedValue(undefined) };
    service = new VaultRoutingService(profiles, writer);
  });

  it('writes into the matching profile vault Meetings folder', async () => {
    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([
      new Profile('equipe', '/vaults/equipe'),
      new Profile('cliente', '/vaults/cliente'),
    ]);

    const written = await service.route(session, note, '/srv/MeetingAI');

    const expected = path.join('/vaults/equipe', 'Meetings', '2026-09-03T20-00-00-000Z.md');
    expect(written).toBe(expected);
    expect(writer.write).toHaveBeenCalledWith(expected, note.toMarkdown(session));
  });

  it('falls back to Processed/notes/unrouted/<profile> when the profile is not available now', async () => {
    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('cliente', '/vaults/cliente')]);

    const written = await service.route(session, note, '/srv/MeetingAI');

    expect(written).toBe(
      path.join('/srv/MeetingAI', 'Processed', 'notes', 'unrouted', 'equipe', '2026-09-03T20-00-00-000Z.md'),
    );
  });

  it('falls back to Processed/notes/unrouted/<profile> when the profile is found but has no vault', async () => {
    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('equipe')]);

    const written = await service.route(session, note, '/srv/MeetingAI');

    expect(written).toBe(
      path.join('/srv/MeetingAI', 'Processed', 'notes', 'unrouted', 'equipe', '2026-09-03T20-00-00-000Z.md'),
    );
  });

  it('respects a profile custom notesFolder', async () => {
    vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('equipe', '/vaults/equipe', 'Reuniões')]);

    const written = await service.route(session, note, '/srv/MeetingAI');

    expect(written).toBe(path.join('/vaults/equipe', 'Reuniões', '2026-09-03T20-00-00-000Z.md'));
  });

  describe('writeTranscript', () => {
    const transcript = new Transcript('pt', [new TranscriptSegment(0, 2, 'bom dia')]);

    it('writes the raw transcript next to where the note would land', async () => {
      vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('equipe', '/vaults/equipe')]);

      const written = await service.writeTranscript(session, transcript, '/srv/MeetingAI');

      const expected = path.join('/vaults/equipe', 'Meetings', '2026-09-03T20-00-00-000Z.transcript.txt');
      expect(written).toBe(expected);
      expect(writer.write).toHaveBeenCalledWith(expected, transcript.toText());
    });

    it('falls back to unrouted the same way route() does when there is no vault', async () => {
      vi.mocked(profiles.listAvailableProfiles).mockResolvedValue([new Profile('equipe')]);

      const written = await service.writeTranscript(session, transcript, '/srv/MeetingAI');

      expect(written).toBe(
        path.join('/srv/MeetingAI', 'Processed', 'notes', 'unrouted', 'equipe', '2026-09-03T20-00-00-000Z.transcript.txt'),
      );
    });
  });
});
