import { Inject, Injectable, Optional } from '@nestjs/common';
import * as path from 'node:path';
import { FrameAnalysis, MeetingNote, RecordingSession, Transcript } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { ProfileService } from '@mt/profiles';
import { NoteWriter, NOTE_WRITER } from './note-writer';

export interface ReportSources { transcript: Transcript; frames: FrameAnalysis[]; frameAnalysisSkipped: boolean; }

@Injectable()
export class VaultRoutingService {
  constructor(
    private readonly profiles: ProfileService,
    @Inject(NOTE_WRITER) private readonly writer: NoteWriter,
    @Optional() private readonly storage?: StorageService,
  ) {}

  async route(session: RecordingSession, note: MeetingNote, storageRoot: string, sources?: ReportSources): Promise<string> {
    const targetDir = await this.resolveTargetDir(session.profileName, storageRoot);
    const filePath = path.join(targetDir, `${session.sessionId}.md`);
    let markdown = note.toMarkdown(session);
    if (sources) {
      markdown += '\n## Transcrição de áudio\n\n' + sources.transcript.toText() + '\n\n## Análise dos frames\n\n';
      if (!sources.frames.length) markdown += sources.frameAnalysisSkipped ? 'Análise visual indisponível ou desativada.\n' : 'Nenhum frame amostrado.\n';
      for (const frame of sources.frames) {
        markdown += `### ${frame.timestampSeconds.toFixed(3)}s\n\n${frame.description}\n\n`;
        if (frame.imagePath) {
          const relative = `${session.sessionId}.assets/${path.basename(frame.imagePath)}`;
          if (!this.writer.copy) throw new Error('O gravador de notas não suporta copiar imagens.');
          await this.writer.copy(frame.imagePath, path.join(targetDir, relative));
          markdown += `![Frame em ${frame.timestampSeconds.toFixed(3)}s](${relative.split('/').map(encodeURIComponent).join('/')})\n\n`;
        }
      }
    }
    await this.writer.write(filePath, markdown);
    return filePath;
  }

  /**
   * Writes the raw transcript as `<session-id>.transcript.txt`, next to
   * where `route()` puts the synthesized note — the source material stays
   * available to check the note against, independent of how well synthesis
   * did that day.
   */
  async writeTranscript(session: RecordingSession, transcript: Transcript, storageRoot: string): Promise<string> {
    const targetDir = await this.resolveTargetDir(session.profileName, storageRoot);
    const filePath = path.join(targetDir, `${session.sessionId}.transcript.txt`);
    await this.writer.write(filePath, transcript.toText());
    return filePath;
  }

  private async resolveTargetDir(profileName: string, storageRoot: string): Promise<string> {
    const profile = (await this.profiles.listAvailableProfiles()).find((candidate) => candidate.name === profileName);
    if (profile?.vaultDirectory) {
      return path.join(profile.vaultDirectory, profile.notesFolder);
    }
    const config = await this.storage?.resolveStorageRoot();
    if (profileName === 'Sem perfil' && config?.preferences.defaultVault) return path.join(config.preferences.defaultVault, 'Meetings');
    const reports = config ? this.storage!.layout(config).reports : path.join(storageRoot, 'Processed', 'notes');
    const folder = profileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+|[. ]+$/g, '') || 'Geral';
    return path.join(reports, 'unrouted', folder);
  }
}
