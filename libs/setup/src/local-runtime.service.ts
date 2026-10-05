import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, promises as fs, createWriteStream, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as path from 'node:path';
import { MachineConfig } from '@mt/domain';
import { StorageService } from '@mt/storage';
import { CURRENT_PLATFORM, SupportedPlatform } from '@mt/platform';
import { EnvironmentSetupService } from './environment-setup.service';
import { ManagedOllamaService } from './managed-ollama.service';
import { PROCESS_RUNNER, ProcessRunner } from './process-runner';

const MEDIUM_SHA256 = '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208';
const WINDOWS_WHISPER_SHA256 = 'c2a4b60edb11f7e11a9191ffb50929535527d4d91c9903dbe3e554583bbbc63d';

@Injectable()
export class LocalRuntimeService implements OnModuleDestroy {
  private readonly overrides = new Map<string, string | undefined>();
  constructor(
    private readonly environment: EnvironmentSetupService,
    private readonly ollama: ManagedOllamaService,
    private readonly storage: StorageService,
    @Inject(PROCESS_RUNNER) private readonly runner: ProcessRunner,
    @Inject(CURRENT_PLATFORM) private readonly platform: SupportedPlatform,
  ) {}

  async prepare(config: MachineConfig, options: { download?: boolean; audioOnly?: boolean; installTools?: boolean } = {}): Promise<string[]> {
    if (options.installTools) {
      await this.installTools(config, options.audioOnly === true);
      config = await this.storage.resolveStorageRoot();
    }
    if (!await this.environment.checkFfmpeg()) throw new Error('FFmpeg ausente. Execute mt prepare --install-tools.');
    const models = this.storage.layout(config).models;
    const binaryName = this.platform === 'windows' ? 'whisper-cli.exe' : 'whisper-cli';
    let binary = this.original('MT_WHISPER_BINARY') ?? config.preferences.whisperBinary;
    if (!binary) {
      const candidates = [path.join(config.storageRoot, 'bin', binaryName), path.join(config.storageRoot, 'bin/whisper', binaryName), '/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
      binary = candidates.find(candidate => existsSync(candidate));
      if (!binary && (await this.runner.run(binaryName, ['--help'])).exitCode === 0) binary = binaryName;
    }
    if (!binary) throw new Error('whisper.cpp ausente. Execute mt prepare --install-tools ou configure --whisper-binary em settings.');
    const file = process.env.MT_WHISPER_MODEL ?? 'ggml-medium.bin';
    const legacyModel = path.join(config.storageRoot, 'bin/models', file);
    const model = this.original('MT_WHISPER_MODEL_PATH') ?? config.preferences.whisperModel ??
      (!config.preferences.paths?.models && existsSync(legacyModel) ? legacyModel : path.join(models, 'whisper', file));
    if (!existsSync(model)) {
      if (!options.download) throw new Error(`O modelo de transcrição não está em ${model}. Execute mt prepare para baixá-lo.`);
      if (file !== 'ggml-medium.bin') throw new Error('Para um modelo personalizado, informe um arquivo existente em settings --whisper-model.');
      await this.download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin', model, MEDIUM_SHA256);
    }
    this.setDefault('MT_WHISPER_BINARY', binary);
    this.setDefault('MT_WHISPER_MODEL_PATH', model);
    this.setDefault('MT_OLLAMA_LLM_MODEL', config.preferences.summaryModel ?? 'llama3.2:3b');
    this.setDefault('MT_OLLAMA_VISION_MODEL', config.preferences.visionModel ?? 'qwen2.5vl');
    const warnings: string[] = [];
    if (!options.audioOnly) {
      if (!await this.environment.checkOllama()) {
        if (options.download) throw new Error('Ollama ausente. Execute mt prepare --install-tools.');
        warnings.push('Ollama ausente: o relatório conterá a transcrição sem resumo automático.');
      } else {
        const legacy = path.join(config.storageRoot, 'ollama-models');
        const directory = !config.preferences.paths?.models && existsSync(legacy) ? legacy : path.join(models, 'ollama');
        if (options.download) await this.environment.pullOllamaModels([process.env.MT_OLLAMA_LLM_MODEL!, process.env.MT_OLLAMA_VISION_MODEL!], config.storageRoot, directory);
        else {
          try { await this.ollama.start(directory); }
          catch (error) { warnings.push(`Ollama: ${(error as Error).message}`); }
        }
      }
    }
    return warnings;
  }

  private original(key: string): string | undefined { return this.overrides.has(key) ? this.overrides.get(key) : process.env[key]; }
  private setDefault(key: string, value: string): void {
    const original = this.original(key);
    if (!this.overrides.has(key)) this.overrides.set(key, original);
    process.env[key] = original ?? value;
  }
  reset(): void { this.ollama.onModuleDestroy(); this.onModuleDestroy(); }

  onModuleDestroy(): void {
    for (const [key, value] of this.overrides) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    this.overrides.clear();
  }

  private async installTools(config: MachineConfig, audioOnly: boolean): Promise<void> {
    const packages: string[] = [];
    if (!await this.environment.checkFfmpeg()) packages.push(this.platform === 'macos' ? 'ffmpeg' : 'Gyan.FFmpeg');
    if (!audioOnly && !await this.environment.checkOllama()) packages.push(this.platform === 'macos' ? 'ollama' : 'Ollama.Ollama');
    const binary = this.platform === 'macos' ? 'whisper-cli' : 'whisper-cli.exe';
    const existing = this.original('MT_WHISPER_BINARY') ?? config.preferences.whisperBinary ?? path.join(config.storageRoot, 'bin', binary);
    const whisperMissing = !existsSync(existing) && (await this.runner.run(binary, ['--help'])).exitCode !== 0;
    if (whisperMissing && this.platform === 'macos') packages.push('whisper-cpp');
    for (const item of packages) {
      const command = this.platform === 'macos' ? 'brew' : 'winget';
      const args = this.platform === 'macos' ? ['install', item] : ['install', '--id', item, '--exact', '--accept-package-agreements', '--accept-source-agreements'];
      const result = await this.runner.run(command, args);
      if (result.exitCode !== 0) throw new Error(`Falha em ${command} install ${item}: ${result.stderr}. Verifique se ${command} está instalado.`);
    }
    if (whisperMissing && this.platform === 'windows') {
      if (process.arch !== 'x64') throw new Error('Instalação automática de whisper.cpp no Windows requer x64; informe --whisper-binary para outra arquitetura.');
      const directory = path.join(config.storageRoot, 'bin/whisper');
      const archive = path.join(config.storageRoot, 'bin/whisper-bin-x64.zip');
      await this.download('https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-x64.zip', archive, WINDOWS_WHISPER_SHA256);
      const result = await this.runner.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:MT_WHISPER_ARCHIVE -DestinationPath $env:MT_WHISPER_DEST -Force'], {
        env: { ...process.env, MT_WHISPER_ARCHIVE: archive, MT_WHISPER_DEST: directory },
      });
      if (result.exitCode !== 0) throw new Error(`Falha ao extrair whisper.cpp: ${result.stderr}`);
      const entries = await fs.readdir(directory, { recursive: true });
      const entry = entries.find(entry => path.basename(entry) === binary);
      if (!entry) throw new Error('O pacote whisper.cpp não contém whisper-cli.exe.');
      // Preserve the accompanying DLLs in the extracted directory.
      config = await this.storage.updatePreferences(config, { whisperBinary: path.join(directory, entry) });
      this.setDefault('MT_WHISPER_BINARY', config.preferences.whisperBinary!);
      await fs.rm(archive, { force: true });
    }
  }

  private async download(url: string, destination: string, expectedHash: string): Promise<void> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const partial = `${destination}.${randomUUID()}.part`;
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`Download falhou: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body as any), createWriteStream(partial, { flags: 'wx' }));
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(partial)) hash.update(chunk);
      if (hash.digest('hex') !== expectedHash) throw new Error('SHA256 do download não confere; arquivo parcial descartado.');
      await fs.rename(partial, destination);
    } finally { await fs.rm(partial, { force: true }); }
  }
}
