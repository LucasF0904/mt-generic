import { describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileProfileRepository } from './file-profile.repository';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => 'C:\\Users\\Test'),
}));

describe('FileProfileRepository', () => {
  let repo: FileProfileRepository;

  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    repo = new FileProfileRepository(['/profiles']);
  });

  it('does not discover external profiles by default', async () => {
    await expect(new FileProfileRepository().listAvailableProfiles()).resolves.toEqual([]);
    expect(fs.readdir).not.toHaveBeenCalled();
  });

  it('returns a profile using the "# Perfil: X" heading as its name, when the referenced directory exists', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['projeto-demo.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Projeto-Demo\n\nDiretório: `Z:\\Development\\Projects\\Projeto-Demo\\demo-docs`\n',
    );
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Projeto-Demo');
    expect(profiles[0].vaultDirectory).toBe('Z:\\Development\\Projects\\Projeto-Demo\\demo-docs');
  });

  it('matches "Diretório local:" as well as plain "Diretório:"', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['projeto-demo.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Projeto-Demo\n\nDiretório local: `Z:\\Development\\Projects\\Projeto-Demo\\demo-docs`\n',
    );
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].vaultDirectory).toBe('Z:\\Development\\Projects\\Projeto-Demo\\demo-docs');
  });

  it('falls back to the filename stem when no "# Perfil:" heading is found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['cliente.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue('Diretório: `Z:\\Development\\Cliente\\.knowledge-base-cliente`\n');
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles[0].name).toBe('cliente');
  });

  it('falls back to the parent of an absolute memory.jsonl path when there is no "Diretório:" line', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['projeto-exemplo.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Projeto Exemplo\n\n| Knowledge graph | arquivo em `/Volumes/ExternalDisk/Development/Projeto Exemplo/segundo-cerebro-projeto-exemplo/memory.jsonl` |\n',
    );
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles[0].vaultDirectory).toBe(
      path.normalize('/Volumes/ExternalDisk/Development/Projeto Exemplo/segundo-cerebro-projeto-exemplo'),
    );
  });

  it('resolves a memory.jsonl path relative to the profile directory', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['cliente.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Cliente\n\nKnowledge graph: MCP `knowledge-base-cliente`, arquivo\n  `Cliente/notes/memory.jsonl`\n',
    );
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles[0].vaultDirectory).toBe(path.join('/profiles', 'Cliente', 'notes'));
  });

  it('prefers an explicit "Diretório:" line over a memory.jsonl reference when both are present', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['cliente.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Cliente\n\nDiretório: `/explicit/path`\n\narquivo `/Volumes/ExternalDisk/Development/Cliente/notes/memory.jsonl`\n',
    );
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles[0].vaultDirectory).toBe('/explicit/path');
  });

  it('still lists a profile whose referenced directory does not exist on this machine, without a vault', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['projeto-demo.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue('# Perfil: Projeto-Demo\n\nDiretório: `Z:\\missing\\path`\n');
    vi.mocked(existsSync).mockReturnValue(false);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Projeto-Demo');
    expect(profiles[0].vaultDirectory).toBeUndefined();
  });

  it('still lists a profile with no "Diretório:" or memory.jsonl line at all, without a vault (e.g. Equipe)', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['equipe.md'] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      '# Perfil: Equipe\n\nNão existe segundo cérebro para projetos Equipe.\n',
    );

    const profiles = await repo.listAvailableProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Equipe');
    expect(profiles[0].vaultDirectory).toBeUndefined();
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('skips an unreadable profile file instead of failing the whole listing', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['locked.md', 'ok.md'] as never);
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).includes('locked')) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      return '# Perfil: OK\n\nDiretório: `/vaults/ok`\n';
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const profiles = await repo.listAvailableProfiles();

    expect(profiles.map((p) => p.name)).toEqual(['OK']);
  });

  it('returns an empty array when the profiles directory does not exist', async () => {
    const error = Object.assign(new Error('not found'), { code: 'ENOENT' });
    vi.mocked(fs.readdir).mockRejectedValue(error);

    await expect(repo.listAvailableProfiles()).resolves.toEqual([]);
  });

  it('rethrows non-ENOENT errors from readdir', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('permission denied'));

    await expect(repo.listAvailableProfiles()).rejects.toThrow('permission denied');
  });
});
