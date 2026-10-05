import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileProfileRepository } from './file-profile.repository';

describe('multiple profile sources', () => {
  it('merges agent profiles and preserves an explicit graph reference independently of the vault', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mt-profiles-'));
    try {
      const codex = join(dir, 'codex'); const claude = join(dir, 'claude'); const vault = join(dir, 'vault');
      await Promise.all([codex, claude, vault].map(p => mkdir(p)));
      const graph = join(dir, 'memory.jsonl'); await writeFile(graph, '');
      await writeFile(join(codex, 'work.md'), `# Perfil: Work\nDiretório: \`${vault}\`\nGrafo: \`${graph}\``);
      await writeFile(join(claude, 'same.md'), '# Perfil: Work');
      await writeFile(join(claude, 'personal.md'), '# Perfil: Personal');
      const profiles = await new FileProfileRepository([codex, claude]).listAvailableProfiles();
      expect(profiles.map(p => p.name)).toEqual(['Work', 'Personal']);
      expect(profiles[0].vaultDirectory).toBe(vault);
      expect(profiles[0].memoryFile).toBe(graph);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
