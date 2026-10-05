import { Injectable } from '@nestjs/common';
import { LocalRuntimeService } from '@mt/setup';
import { spawn } from 'node:child_process';

/** Prompts run in another process so their readline parser never shares TUI stdin. */
@Injectable()
export class CliAssistantService {
  constructor(private readonly runtime: LocalRuntimeService) {}
  run(command: 'settings' | 'prepare'): Promise<void> {
    // Do not pass managed model paths/server URLs from an earlier processing run to the child.
    this.runtime.reset();
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], command], { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Assistente ${command} encerrado${signal ? ` por ${signal}` : ` (código ${code})`}.`)));
    });
  }
}
