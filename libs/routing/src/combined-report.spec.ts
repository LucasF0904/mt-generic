import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { it, expect } from 'vitest';
import { AudioMode, FrameAnalysis, MeetingNote, RecordingSession, Transcript, TranscriptSegment } from '@mt/domain';
import { VaultRoutingService } from './vault-routing.service';
import { FsNoteWriter } from './fs-note-writer';
it('keeps audio separate and copies screenshots alongside the complete report at the selected location', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-report-test-'));
  try {
    const screenshot = path.join(directory, 'source.jpg'); await fs.writeFile(screenshot, 'image');
    const reports = path.join(directory, 'custom-reports');
    const routing = new VaultRoutingService({ listAvailableProfiles: async () => [] } as any, new FsNoteWriter(), {
      resolveStorageRoot: async () => ({ preferences: {} }), layout: () => ({ reports }),
    } as any);
    const session = new RecordingSession('meeting', 'Sem perfil', 0, AudioMode.Meeting, new Date(), '/recording');
    const transcript = new Transcript('pt', [new TranscriptSegment(0, 2, 'Som da reunião')]);
    const audio = await routing.writeTranscript(session, transcript, directory);
    const report = await routing.route(session, new MeetingNote('Resumo', [], [], [], []), directory, {
      transcript, frames: [new FrameAnalysis(1, 'Tela com uma tabela', screenshot)], frameAnalysisSkipped: false,
    });
    expect(report.startsWith(reports)).toBe(true);
    expect(await fs.readFile(audio, 'utf8')).not.toContain('Tabela');
    const markdown = await fs.readFile(report, 'utf8');
    expect(markdown).toContain('Som da reunião'); expect(markdown).toContain('Tela com uma tabela');
    expect(markdown).toContain('meeting.assets/source.jpg');
    await fs.rm(screenshot);
    expect(await fs.readFile(path.join(path.dirname(report), 'meeting.assets/source.jpg'), 'utf8')).toBe('image');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
it('uses the configured generic vault and explicitly describes unavailable visual analysis', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-generic-report-'));
  try {
    const routing = new VaultRoutingService({ listAvailableProfiles: async () => [] } as any, new FsNoteWriter(), {
      resolveStorageRoot: async () => ({ preferences: { defaultVault: directory } }), layout: () => ({ reports: '/unused' }),
    } as any);
    const session = new RecordingSession('meeting', 'Sem perfil', 0, AudioMode.Meeting, new Date(), '/recording');
    const report = await routing.route(session, new MeetingNote('', [], [], [], []), '/unused', {
      transcript: new Transcript('pt', []), frames: [], frameAnalysisSkipped: true,
    });
    expect(report).toBe(path.join(directory, 'Meetings/meeting.md'));
    expect(await fs.readFile(report, 'utf8')).toContain('Análise visual indisponível');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
