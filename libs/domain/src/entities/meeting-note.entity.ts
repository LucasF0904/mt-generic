import { RecordingSession } from './recording-session.entity';

export interface MeetingNoteSections {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actions: string[];
  risks: string[];
}

/**
 * The structured meeting note produced by synthesis (design spec §2): a short
 * summary plus the four bullet lists that route into the second-brain vault.
 */
export class MeetingNote {
  constructor(
    public readonly summary: string,
    public readonly keyPoints: string[],
    public readonly decisions: string[],
    public readonly actions: string[],
    public readonly risks: string[],
  ) {}

  /** Builds a note from a loosely-typed synthesis payload, tolerating missing keys. */
  static fromSections(sections: Partial<MeetingNoteSections>): MeetingNote {
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((item) => String(item).trim()).filter((item) => item.length > 0) : [];
    return new MeetingNote(
      typeof sections.summary === 'string' ? sections.summary.trim() : '',
      list(sections.keyPoints),
      list(sections.decisions),
      list(sections.actions),
      list(sections.risks),
    );
  }

  toMarkdown(session: RecordingSession): string {
    const recordedAt = session.recordedAt.toISOString();
    const bullets = (items: string[]): string => (items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- —');
    return [
      `# Reunião — ${recordedAt}`,
      '',
      `- **Perfil:** ${session.profileName}`,
      `- **Sessão:** ${session.sessionId}`,
      `- **Gravada em:** ${recordedAt}`,
      '',
      '## Resumo',
      '',
      this.summary.length > 0 ? this.summary : '—',
      '',
      '## Pontos principais',
      '',
      bullets(this.keyPoints),
      '',
      '## Decisões',
      '',
      bullets(this.decisions),
      '',
      '## Ações',
      '',
      bullets(this.actions),
      '',
      '## Riscos',
      '',
      bullets(this.risks),
      '',
    ].join('\n');
  }
}
