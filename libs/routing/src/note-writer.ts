export interface NoteWriter {
  /** Creates any missing parent directories and writes the note file. */
  copy?(source: string, destination: string): Promise<void>;
  write(filePath: string, contents: string): Promise<void>;
}

export const NOTE_WRITER = Symbol('NOTE_WRITER');
