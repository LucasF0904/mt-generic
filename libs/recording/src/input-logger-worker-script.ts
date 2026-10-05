/**
 * Source for the isolated `node -e` worker spawned by {@link UiohookInputLogger}.
 *
 * Why a raw script string instead of a compiled sibling file: `apps/cli` builds
 * to a single webpack bundle (`nest build cli`), so there is no separate,
 * reliably-addressable `.js` file next to `main.js` to `fork()` at runtime —
 * across ts-node, the webpack bundle, and a global install alike, `node -e`
 * with this string is the one thing that always works the same way.
 *
 * `uiohook-napi`'s module path is resolved by the parent process (which
 * knows its own `node_modules`) and passed in via env var, rather than
 * `require()`d by bare specifier here — `node -e` has no notion of "this
 * package's node_modules" to resolve against.
 *
 * Active window is read by shelling out to `osascript`/`System Events`
 * (macOS) or a small inline `user32.dll` call via PowerShell (Windows) —
 * the same "shell out to a native OS tool" idiom the storage libs already
 * use for disk discovery — rather than a third-party package, so this
 * worker doesn't need a second resolved module path at all.
 */
export const INPUT_LOGGER_WORKER_SCRIPT = `
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { uIOhook } = require(process.env.MT_UIOHOOK_PATH);

const out = fs.createWriteStream(process.env.MT_INPUT_LOG_PATH, { flags: 'a' });
const write = (event) => out.write(JSON.stringify(event) + '\\n');

uIOhook.on('click', (e) => {
  write({ kind: 'click', timestamp: new Date().toISOString(), data: { x: e.x, y: e.y, button: e.button } });
});

if (process.env.MT_CAPTURE_RAW_KEYS === '1') {
  uIOhook.on('keydown', (e) => {
    write({ kind: 'keydown', timestamp: new Date().toISOString(), data: { keycode: e.keycode } });
  });
}

function readActiveWindowMacos() {
  const script = [
    'tell application "System Events"',
    '  set frontApp to first application process whose frontmost is true',
    '  set appName to name of frontApp',
    '  try',
    '    set winTitle to name of front window of frontApp',
    '  on error',
    '    set winTitle to ""',
    '  end try',
    'end tell',
    'return appName & linefeed & winTitle',
  ].join('\\n');
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (error, stdout) => {
      if (error) { resolve(null); return; }
      const lines = String(stdout).split('\\n');
      resolve({ appName: (lines[0] || '').trim(), title: (lines[1] || '').trim() });
    });
  });
}

function readActiveWindowWindows() {
  const script = [
    "Add-Type @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public class MtWin32 {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
    '}',
    "'@",
    '$hwnd = [MtWin32]::GetForegroundWindow()',
    '$sb = New-Object System.Text.StringBuilder 256',
    '[MtWin32]::GetWindowText($hwnd, $sb, 256) | Out-Null',
    '$procId = 0',
    '[MtWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null',
    '$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue',
    'if ($proc) { Write-Output $proc.ProcessName } else { Write-Output "" }',
    'Write-Output $sb.ToString()',
  ].join('\\n');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error, stdout) => {
      if (error) { resolve(null); return; }
      const lines = String(stdout).split(/\\r?\\n/);
      resolve({ appName: (lines[0] || '').trim(), title: (lines[1] || '').trim() });
    });
  });
}

let lastWindowLabel = null;
const pollActiveWindow = async () => {
  try {
    const win =
      os.platform() === 'darwin' ? await readActiveWindowMacos() :
      os.platform() === 'win32' ? await readActiveWindowWindows() :
      null;
    if (!win || (!win.appName && !win.title)) return;
    const label = win.appName + '\\u0000' + win.title;
    if (label !== lastWindowLabel) {
      lastWindowLabel = label;
      write({ kind: 'window', timestamp: new Date().toISOString(), data: { title: win.title, appName: win.appName } });
    }
  } catch {
    // Best-effort: a transient failure to read the active window (e.g. no
    // window focused) must not stop click/key logging.
  }
};
const windowIntervalId = setInterval(pollActiveWindow, 1500);
pollActiveWindow();

uIOhook.start();

process.on('SIGTERM', () => {
  clearInterval(windowIntervalId);
  uIOhook.stop();
  out.end(() => process.exit(0));
});
`;
