'use strict';
// Integration check: a packed release must run without this checkout or devDependencies.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Execute com npm run test:package');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mt package-'));
const prefix = path.join(temporary, 'global');
const cwd = path.join(temporary, 'outside-project');
fs.mkdirSync(cwd);
const npm = (args, directory = root) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd: directory, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
try {
  // npm also forwards prepack's build output before the JSON result.
  const output = npm(['pack', '--json', '--silent', '--pack-destination', temporary]);
  const [packed] = JSON.parse(output.slice(output.lastIndexOf('\n[') + 1));
  assert.ok(packed.files.some(file => file.path === 'bin/mt.cjs'), 'O pacote precisa fornecer o executável mt');
  assert.ok(packed.files.some(file => file.path === 'dist/apps/cli/main.js'), 'O pacote precisa conter o aplicativo compilado');
  for (const file of packed.files) {
    assert.ok(['package.json', 'README.md', 'bin/mt.cjs', 'dist/apps/cli/main.js'].includes(file.path), `Arquivo inesperado no pacote: ${file.path}`);
  }
  console.log('Pacote contém somente o aplicativo, o executável e seus metadados.');
  npm(['install', '--global', '--prefix', prefix, '--omit=dev', '--no-audit', '--no-fund', path.join(temporary, packed.filename)], cwd);
  const executable = process.platform === 'win32' ? path.join(prefix, 'mt.cmd') : path.join(prefix, 'bin/mt');
  const run = args => process.platform === 'win32'
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${executable}" ${args.join(' ')}"`], { cwd, encoding: 'utf8', timeout: 15000, stdio: 'pipe' })
    : execFileSync(executable, args, { cwd, encoding: 'utf8', timeout: 15000, stdio: 'pipe' });
  assert.match(run(['--help']), /Usage: mt/);
  assert.match(run(['process', '--help']), /--file <path>/);
  assert.match(run(['settings', '--help']), /--storage-root <path>/);
  assert.equal(run(['--version']).trim(), require('../package.json').version);
  assert.throws(() => run(['--unknown-option-for-package-test']), error => error.status === 1 && /unknown option/.test(String(error.stderr)));
  assert.deepEqual(fs.readdirSync(cwd), [], 'Ajuda e versão não devem criar arquivos na pasta atual');
  console.log('Instalação global isolada aprovada: mt, subcomandos, versão e código de erro.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
