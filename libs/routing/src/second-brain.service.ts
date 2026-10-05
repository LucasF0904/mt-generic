import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { RecordingSession } from '@mt/domain';
import { ProfileService } from '@mt/profiles';

export type GraphRegistration = 'registered' | 'already-registered' | 'no-profile-memory';

@Injectable()
export class SecondBrainService {
  constructor(private readonly profiles: ProfileService) {}

  /** Opt-in JSONL export compatible with the entity format used by SC memory. */
  async register(session: RecordingSession, notePath: string, transcriptPath: string, summary: string): Promise<GraphRegistration> {
    const profile = (await this.profiles.listAvailableProfiles()).find(item => item.name === session.profileName);
    if (!profile?.memoryFile) return 'no-profile-memory';
    const file = profile.memoryFile;
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Serializes mt writers. Other SC clients should not rewrite memory during export.
    const lock = await fs.open(`${file}.mt.lock`, 'wx');
    try {
      let original = '';
      try { original = await fs.readFile(file, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      let entries: Array<Record<string, unknown>>;
      try {
        entries = original.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
        if (entries.some(entry => !entry || (entry.type !== 'entity' && entry.type !== 'relation'))) throw new Error('formato desconhecido');
      } catch { throw new Error('Memória SC não está em JSONL de entidades/relações; o arquivo foi preservado.'); }
      const name = `mt:${session.sessionId}`;
      if (entries.some(entry => entry.type === 'entity' && entry.name === name)) return 'already-registered';
      const entity = { type: 'entity', name, entityType: 'meeting', observations: [
        `Perfil: ${session.profileName}`, `Data: ${session.recordedAt.toISOString()}`,
        `Relatório: ${notePath}`, `Transcrição de áudio: ${transcriptPath}`, `Resumo: ${summary}`,
      ] };
      await fs.appendFile(file, `${original && !original.endsWith('\n') ? '\n' : ''}${JSON.stringify(entity)}\n`, 'utf8');
      return 'registered';
    } finally { await lock.close(); await fs.rm(`${file}.mt.lock`, { force: true }); }
  }
}
