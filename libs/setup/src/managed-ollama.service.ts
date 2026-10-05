import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';

@Injectable()
export class ManagedOllamaService implements OnModuleDestroy {
  private child?: ChildProcess;
  private directory?: string;
  private url?: string;
  private readonly explicitUrl = process.env.MT_OLLAMA_URL;
  private readonly cleanup = () => this.stop();

  async start(modelsDirectory: string): Promise<string> {
    if (this.explicitUrl) {
      const url = new URL(this.explicitUrl);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('O processamento local exige MT_OLLAMA_URL em localhost.');
      const response = await fetch(`${this.explicitUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('O servidor Ollama informado não está disponível.');
      return this.explicitUrl;
    }
    if (this.child && this.child.exitCode === null && this.child.signalCode === null && this.directory === modelsDirectory) return this.url!;
    this.stop();
    await fs.mkdir(modelsDirectory, { recursive: true });
    const port = await this.availablePort();
    this.url = `http://127.0.0.1:${port}`;
    this.directory = modelsDirectory;
    let failure: Error | undefined;
    let log = '';
    this.child = spawn(process.env.MT_OLLAMA_BINARY ?? 'ollama', ['serve'], {
      env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODELS: modelsDirectory, OLLAMA_NO_CLOUD: '1' },
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    this.child.once('error', error => { failure = error; });
    this.child.stderr?.on('data', chunk => { log = (log + chunk.toString()).slice(-4000); });
    process.once('exit', this.cleanup);
    try {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (failure || this.child.exitCode !== null) throw failure ?? new Error(log || 'Ollama encerrou ao iniciar.');
        try {
          const response = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(1000) });
          if (response.ok) { process.env.MT_OLLAMA_URL = this.url; return this.url; }
        } catch { /* Wait for our own server to bind. */ }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error('Ollama não ficou pronto em 15 segundos.');
    } catch (error) { this.stop(); throw error; }
  }

  onModuleDestroy(): void { this.stop(); }

  private stop(): void {
    this.child?.kill(); this.child = undefined;
    if (process.env.MT_OLLAMA_URL === this.url) {
      if (this.explicitUrl === undefined) delete process.env.MT_OLLAMA_URL;
      else process.env.MT_OLLAMA_URL = this.explicitUrl;
    }
    process.removeListener('exit', this.cleanup);
  }

  private availablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer(); server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        server.close(error => error ? reject(error) : resolve(port));
      });
    });
  }
}
