import { execFile } from 'node:child_process';
import { FrameSource } from './frame-source';

const DEFAULT_SCENE_THRESHOLD = 0.4;

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} falhou: ${stderr?.trim() || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Frame discovery/extraction via ffprobe/ffmpeg (design spec §9). */
export class FfmpegFrameSource implements FrameSource {
  async getDurationSeconds(videoPath: string): Promise<number> {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration)) {
      throw new Error(`ffprobe não retornou uma duração válida para "${videoPath}": "${stdout.trim()}"`);
    }
    return duration;
  }

  async detectSceneChangeTimestamps(videoPath: string): Promise<number[]> {
    const threshold = Number(process.env.MT_SCENE_THRESHOLD ?? DEFAULT_SCENE_THRESHOLD);
    // `select` + `showinfo` writes one line per selected frame to stderr
    // (ffmpeg always logs there); `-f null -` decodes without writing output.
    // `-fps_mode vfr` is `-vsync vfr`'s modern replacement: ffmpeg deprecated
    // `-vsync` around 5.1 and dropped it entirely in newer releases (9.x),
    // so `-vsync` alone would break on a fresh `brew install ffmpeg`.
    const { stderr } = await run('ffmpeg', [
      '-i',
      videoPath,
      '-filter:v',
      `select='gt(scene,${threshold})',showinfo`,
      '-fps_mode',
      'vfr',
      '-f',
      'null',
      '-',
    ]);
    const timestamps: number[] = [];
    for (const match of stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
      timestamps.push(Number(match[1]));
    }
    return timestamps;
  }

  async extractFrame(videoPath: string, timestampSeconds: number, outputPath: string): Promise<void> {
    await run('ffmpeg', [
      '-y',
      '-ss',
      timestampSeconds.toFixed(3),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputPath,
    ]);
  }
}
