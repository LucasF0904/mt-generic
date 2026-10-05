import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { SupportedPlatform } from '@mt/platform';
import { Transcript, TranscriptSegment } from '@mt/domain';
import { Transcriber } from './transcriber';

interface WhisperJson {
  result?: { language?: string };
  transcription?: Array<{ offsets?: { from?: number; to?: number }; text?: string }>;
}

const DEFAULT_LANGUAGE = 'pt';
const DEFAULT_MODEL_FILE = 'ggml-medium.bin';

// whisper-cli logs its own progress as it goes — no separate ffprobe call
// needed to compute a percentage:
//   main: processing '<file>' (249151 samples, 15.6 sec), ...
//   [00:00:00.000 --> 00:00:06.640]  text...
const DURATION_PATTERN = /\(\d+\s+samples,\s*([\d.]+)\s*sec\)/;
const SEGMENT_END_PATTERN = /-->\s*(\d{2}):(\d{2}):(\d{2})\.\d+\]/g;

/**
 * Drives the whisper.cpp CLI (`<storageRoot>/bin/whisper-cli[.exe]`) with a
 * model from `<storageRoot>/bin/models/`, asking for JSON output (`-oj`) and
 * mapping its millisecond offsets onto {@link TranscriptSegment}s.
 *
 * Overridable via env: `MT_WHISPER_LANG`, `MT_WHISPER_MODEL`.
 */
export class WhisperCppAdapter implements Transcriber {
  constructor(private readonly platform: SupportedPlatform) {}

  async transcribe(wavPath: string, storageRoot: string, onProgress?: (percent: number) => void): Promise<Transcript> {
    const language = process.env.MT_WHISPER_LANG ?? DEFAULT_LANGUAGE;
    const binaryName = this.platform === 'windows' ? 'whisper-cli.exe' : 'whisper-cli';
    const binaryPath = process.env.MT_WHISPER_BINARY ?? path.join(storageRoot, 'bin', binaryName);
    const modelPath = process.env.MT_WHISPER_MODEL_PATH ?? path.join(storageRoot, 'bin', 'models', process.env.MT_WHISPER_MODEL ?? DEFAULT_MODEL_FILE);
    const outBase = wavPath.replace(/\.wav$/i, '');

    await this.run(binaryPath, ['-m', modelPath, '-f', wavPath, '-l', language, '-oj', '-of', outBase], onProgress);

    const parsed = JSON.parse(await fs.readFile(`${outBase}.json`, 'utf-8')) as WhisperJson;
    const segments = (parsed.transcription ?? []).map((entry) => {
      const from = (entry.offsets?.from ?? 0) / 1000;
      const to = (entry.offsets?.to ?? from) / 1000;
      return new TranscriptSegment(from, Math.max(from, to), (entry.text ?? '').trim());
    });

    return new Transcript(parsed.result?.language ?? language, segments);
  }

  private run(command: string, args: string[], onProgress?: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args);
      let stderr = '';
      // Accumulated, not per-chunk: Node's chunk boundaries don't respect log
      // lines, so the duration line or a segment's `-->` timestamp can each
      // land split across two 'data' events. Re-scanning the running total
      // is cheap (a whisper.cpp log is at most tens of KB) and immune to that.
      let buffer = '';
      let totalSeconds: number | undefined;
      let lastReportedPercent = -1;

      const watch = (chunk: Buffer) => {
        if (!onProgress) {
          return;
        }
        buffer += chunk.toString();

        if (totalSeconds === undefined) {
          const match = DURATION_PATTERN.exec(buffer);
          if (match) {
            totalSeconds = Number(match[1]);
          }
        }
        if (totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
          return;
        }

        let latestEndSeconds = 0;
        for (const match of buffer.matchAll(SEGMENT_END_PATTERN)) {
          const endSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          latestEndSeconds = Math.max(latestEndSeconds, endSeconds);
        }
        const percent = Math.max(0, Math.min(100, Math.round((latestEndSeconds / totalSeconds) * 100)));
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          onProgress(percent);
        }
      };

      // whisper-cli's exact split between stdout/stderr has varied across
      // versions; watching both for the same patterns is harmless and robust
      // to that. stderr is also kept in full, separately, for the error
      // message below.
      child.stdout?.on('data', watch);
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        watch(chunk);
      });
      child.once('error', (error) => {
        reject(new Error(`whisper.cpp falhou na transcrição: ${error.message}`));
      });
      child.once('exit', (code, signal) => {
        if (signal !== null || (code !== null && code !== 0)) {
          reject(new Error(`whisper.cpp falhou na transcrição: ${stderr.trim() || `exit code ${code}`}`));
          return;
        }
        resolve();
      });
    });
  }
}
