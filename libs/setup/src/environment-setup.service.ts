import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { CURRENT_PLATFORM, SupportedPlatform } from '@mt/platform';
import { ManagedOllamaService } from './managed-ollama.service';
import { ProcessRunner, PROCESS_RUNNER } from './process-runner';

@Injectable()
export class EnvironmentSetupService {
  constructor(
    @Inject(PROCESS_RUNNER) private readonly runner: ProcessRunner,
    @Inject(CURRENT_PLATFORM) private readonly platform: SupportedPlatform,
    private readonly ollama: ManagedOllamaService,
  ) {}

  /** Absolute path where the whisper.cpp CLI is expected under the storage root. */
  whisperCliPath(storageRoot: string): string {
    const binary = this.platform === 'windows' ? 'whisper-cli.exe' : 'whisper-cli';
    return path.join(storageRoot, 'bin', binary);
  }

  async checkFfmpeg(): Promise<boolean> {
    const result = await this.runner.run('ffmpeg', ['-version']);
    return result.exitCode === 0;
  }

  async checkOllama(): Promise<boolean> {
    const result = await this.runner.run('ollama', ['--version']);
    return result.exitCode === 0;
  }

  async checkWhisperCpp(storageRoot: string): Promise<boolean> {
    return existsSync(this.whisperCliPath(storageRoot));
  }

  async pullOllamaModels(models: string[], storageRoot: string, modelDirectory?: string): Promise<void> {
    const modelsDir = modelDirectory ?? path.join(storageRoot, 'ollama-models');
    await fs.mkdir(modelsDir, { recursive: true });

    const url = await this.ollama.start(modelsDir);
    for (const model of models) {
      const response = await fetch(`${url.replace(/\/$/, '')}/api/pull`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: false }),
      });
      const result = await response.json() as { error?: string; status?: string };
      if (!response.ok || result.error || result.status !== 'success') {
        throw new Error(`Failed to pull Ollama model "${model}": ${result.error ?? response.statusText ?? result.status}`);
      }
    }
  }
}
