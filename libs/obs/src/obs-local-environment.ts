import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SupportedPlatform } from '@mt/platform';
import { ObsMonitor } from './obs-client.adapter';

interface WebsocketConfig {
  server_enabled?: boolean;
  server_port?: number;
  auth_required?: boolean;
  server_password?: string;
  [key: string]: unknown;
}

// Native enumeration only: no application UI or automation permissions needed.
// Binding CFUUIDCreateString as an Objective-C object is necessary for JXA to
// bridge the returned CFString. No Xcode, Python or third-party driver required.
const MAC_DISPLAYS = `
ObjC.import('AppKit'); ObjC.import('CoreGraphics');
ObjC.bindFunction('CFUUIDCreateString', ['id', ['void *', 'void *']]);
JSON.stringify(ObjC.unwrap($.NSScreen.screens).map(function(screen, index) {
  var id = screen.deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue;
  var uuid = $.CGDisplayCreateUUIDFromDisplayID(id);
  var value = $.CFUUIDCreateString(null, uuid);
  var result = { monitorIndex: index, monitorName: ObjC.unwrap(screen.localizedName), captureId: ObjC.unwrap(value) };
  return result;
}));`;

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15000, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export class ObsLocalEnvironment {
  private readonly configFile: string;

  constructor(private readonly platform: SupportedPlatform, configDirectory?: string) {
    const directory = configDirectory ?? process.env.MT_OBS_CONFIG_DIR ?? (platform === 'macos'
      ? join(homedir(), 'Library', 'Application Support', 'obs-studio')
      : join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'obs-studio'));
    this.configFile = join(directory, 'plugin_config', 'obs-websocket', 'config.json');
  }

  private isLocal(url: string): boolean {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  }

  private async readConfig(): Promise<WebsocketConfig> {
    try { return JSON.parse(await fs.readFile(this.configFile, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async resolveConnection(url?: string, password?: string): Promise<{ url: string; password?: string }> {
    if (url && !this.isLocal(url)) return { url, password };
    const config = await this.readConfig();
    const port = config.server_port ?? 4455;
    const resolved = url ?? `ws://127.0.0.1:${port}`;
    const samePort = Number(new URL(resolved).port || 80) === port;
    return {
      url: resolved,
      password: password ?? (samePort && config.auth_required !== false ? config.server_password : undefined),
    };
  }

  async listMacMonitors(): Promise<ObsMonitor[]> {
    const monitors = JSON.parse(await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_DISPLAYS])) as ObsMonitor[];
    if (monitors.some((monitor) => !monitor.captureId || typeof monitor.captureId !== 'string')) {
      throw new Error('Não foi possível identificar os UUIDs dos monitores do macOS.');
    }
    return monitors;
  }

  private async isRunning(): Promise<boolean> {
    if (this.platform === 'windows') {
      return /"obs64\.exe"/i.test(await run('tasklist.exe', ['/FI', 'IMAGENAME eq obs64.exe', '/FO', 'CSV', '/NH']));
    }
    try {
      await run('/usr/bin/pgrep', ['-f', '/OBS.app/Contents/MacOS/OBS']);
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 1) return false;
      throw error;
    }
  }

  async ensureRunning(url: string): Promise<void> {
    if (!this.isLocal(url)) throw new Error('OBS remoto indisponível — confira a URL e o servidor remoto.');
    const config = await this.readConfig();
    if (await this.isRunning()) {
      if (!config.server_enabled) {
        throw new Error('OBS está aberto com WebSocket desabilitado. Habilite em Tools > WebSocket Server Settings ou feche o OBS e tente novamente.');
      }
      return;
    }
    const requestedPort = Number(new URL(url).port || 80);
    if (config.server_port !== undefined && config.server_port !== requestedPort) {
      throw new Error('A porta solicitada difere da configuração local do OBS. Ajuste --obs-url ou as configurações do OBS.');
    }
    const executable = this.platform === 'windows' ? this.windowsExecutable() : undefined;
    const updated: WebsocketConfig = {
      ...config, server_enabled: true, server_port: requestedPort,
      auth_required: config.auth_required ?? true,
      server_password: config.server_password || randomBytes(24).toString('hex'),
    };
    await fs.mkdir(dirname(this.configFile), { recursive: true });
    await fs.writeFile(this.configFile, JSON.stringify(updated, null, 2), { mode: 0o600 });
    if (this.platform === 'macos') {
      await run('/usr/bin/open', ['-a', 'OBS']);
    } else {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable!, [], { cwd: dirname(executable!), detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
    }
  }

  private windowsExecutable(): string {
    const candidates = [process.env.MT_OBS_EXECUTABLE,
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'obs-studio', 'bin', '64bit', 'obs64.exe'),
      join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'obs-studio', 'bin', '64bit', 'obs64.exe'),
    ];
    const executable = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!executable) throw new Error('OBS não encontrado. Instale o OBS Studio ou defina MT_OBS_EXECUTABLE com o caminho de obs64.exe.');
    return executable;
  }
}
