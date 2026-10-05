import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NoteWriter } from './note-writer';

export class FsNoteWriter implements NoteWriter {
  async copy(source: string, destination: string): Promise<void> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }

  async write(filePath: string, contents: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, 'utf-8');
  }
}
