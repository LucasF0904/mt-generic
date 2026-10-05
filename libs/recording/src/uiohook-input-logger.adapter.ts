import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { InputLogger, InputLoggerHandle, InputLoggerOptions } from './input-logger';
import { INPUT_LOGGER_WORKER_SCRIPT } from './input-logger-worker-script';

// `nest build cli` bundles this file into a single webpack output. Webpack
// rewrites a literal `require.resolve('uiohook-napi')` into its own internal
// numeric module id instead of Node's real filesystem path — fine for a
// normal `require()`, broken here because that "path" gets handed to the
// *unbundled* input-logger child process (see input-logger-worker-script.ts),
// whose own `require(...)` has no idea what to do with a bundler-internal id.
// `__non_webpack_require__` is webpack's own documented escape hatch: the
// real, unbundled Node `require`, injected as a global into every webpack
// bundle. It doesn't exist outside one (vitest, ts-node), hence the guard.
declare const __non_webpack_require__: NodeRequire | undefined;
const nodeRequire: NodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;

/**
 * Runs the uiohook-napi global input hook in an isolated `node -e` child
 * process (see input-logger-worker-script.ts for why). On macOS, without the
 * Accessibility permission granted to the host process, the native hook
 * aborts the whole process hard — not a catchable JS exception — so this
 * adapter never lets that reach `mt record`'s own process: a crashed logger
 * is reported through `stop()`'s `crashed` flag, never thrown.
 */
export class UiohookInputLogger implements InputLogger {
  constructor(private readonly uiohookModulePath: string = nodeRequire.resolve('uiohook-napi')) {}

  async start(
    options: InputLoggerOptions,
    storageRoot: string,
  ): Promise<{ handle: InputLoggerHandle; outputPath: string }> {
    const outputPath = path.join(storageRoot, '.tmp', `input-${randomUUID()}.jsonl`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const child = spawn(process.execPath, ['-e', INPUT_LOGGER_WORKER_SCRIPT], {
      env: {
        ...process.env,
        MT_INPUT_LOG_PATH: outputPath,
        MT_CAPTURE_RAW_KEYS: options.captureRawKeys ? '1' : '0',
        MT_UIOHOOK_PATH: this.uiohookModulePath,
      },
      stdio: 'ignore',
    });

    let crashed = false;
    let finished = false;
    const exited = new Promise<void>((resolve) => {
      child.once('exit', (code, signal) => {
        crashed ||= signal !== null || (code !== null && code !== 0);
        finished = true;
        resolve();
      });
      child.once('error', () => { crashed = true; finished = true; resolve(); });
    });
    let stopping: Promise<{ crashed: boolean }> | undefined;
    const handle: InputLoggerHandle = {
      stop: () => stopping ??= (async () => {
        if (!finished) {
          child.kill('SIGTERM');
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([exited, new Promise<void>(resolve => {
            timer = setTimeout(() => {
              crashed = true;
              child.kill('SIGKILL');
              // A wedged native worker must never hold the menu open.
              child.unref?.();
              resolve();
            }, 2000);
          })]);
          clearTimeout(timer);
        }
        return { crashed };
      })(),
    };

    return { handle, outputPath };
  }
}
