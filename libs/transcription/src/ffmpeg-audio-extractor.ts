import { execFile } from 'node:child_process';
import { AudioExtractor } from './audio-extractor';

// whisper.cpp wants 16 kHz mono signed-16-bit PCM; `-vn` drops the video track.
const FFMPEG_ARGS = (input: string, output: string): string[] => [
  '-y',
  '-i',
  input,
  '-vn',
  '-ac',
  '1',
  '-ar',
  '16000',
  '-c:a',
  'pcm_s16le',
  output,
];

export class FfmpegAudioExtractor implements AudioExtractor {
  toWav(videoPath: string, wavPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('ffmpeg', FFMPEG_ARGS(videoPath, wavPath), (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg falhou ao extrair o áudio: ${stderr?.trim() || error.message}`));
          return;
        }
        resolve();
      });
    });
  }
}
