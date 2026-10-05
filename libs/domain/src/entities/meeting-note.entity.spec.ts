import { describe, expect, it } from 'vitest';
import { MeetingNote } from './meeting-note.entity';
import { RecordingSession } from './recording-session.entity';
import { AudioMode } from '../value-objects/audio-mode.value-object';

const session = new RecordingSession(
  '2026-09-03T20-00-00-000Z',
  'equipe',
  0,
  AudioMode.Meeting,
  new Date('2026-09-03T20:00:00.000Z'),
  '/srv/MeetingAI/Processed/2026-09-03T20-00-00-000Z/recording.mkv',
);

describe('MeetingNote.fromSections', () => {
  it('trims the summary and drops blank / non-string list items', () => {
    const note = MeetingNote.fromSections({
      summary: '  alinhamento de roadmap  ',
      keyPoints: ['ponto A', '   ', 2 as unknown as string],
      decisions: ['decidido X'],
      actions: [],
      risks: undefined,
    });

    expect(note.summary).toBe('alinhamento de roadmap');
    expect(note.keyPoints).toEqual(['ponto A', '2']);
    expect(note.decisions).toEqual(['decidido X']);
    expect(note.actions).toEqual([]);
    expect(note.risks).toEqual([]);
  });
});

describe('MeetingNote.toMarkdown', () => {
  it('renders the four sections with an em dash placeholder when a list is empty', () => {
    const note = new MeetingNote('resumo curto', ['ponto 1'], [], ['fazer Y'], []);

    const md = note.toMarkdown(session);

    expect(md).toContain('# Reunião — 2026-09-03T20:00:00.000Z');
    expect(md).toContain('- **Perfil:** equipe');
    expect(md).toContain('- **Sessão:** 2026-09-03T20-00-00-000Z');
    expect(md).toContain('## Pontos principais\n\n- ponto 1');
    expect(md).toContain('## Decisões\n\n- —');
    expect(md).toContain('## Ações\n\n- fazer Y');
    expect(md).toContain('## Riscos\n\n- —');
  });

  it('falls back to an em dash when the summary is blank', () => {
    const md = new MeetingNote('', [], [], [], []).toMarkdown(session);

    expect(md).toContain('## Resumo\n\n—\n');
  });
});
