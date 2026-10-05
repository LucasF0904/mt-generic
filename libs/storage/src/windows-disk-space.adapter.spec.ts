import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { WindowsDiskSpaceAdapter } from './windows-disk-space.adapter';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('WindowsDiskSpaceAdapter', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('parses PowerShell Get-PSDrive output into disk candidates', async () => {
    const psOutput = JSON.stringify([
      { Name: 'C', Free: 50_000_000_000 },
      { Name: 'Z', Free: 900_000_000_000 },
    ]);
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => {
      cb(null, psOutput, '');
    }) as any);

    const adapter = new WindowsDiskSpaceAdapter();
    const candidates = await adapter.listCandidates();

    expect(candidates).toEqual([
      { path: 'C:\\', freeBytes: 50_000_000_000 },
      { path: 'Z:\\', freeBytes: 900_000_000_000 },
    ]);
  });

  it('handles a single-drive machine where PowerShell returns an object, not an array', async () => {
    const psOutput = JSON.stringify({ Name: 'C', Free: 50_000_000_000 });
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => {
      cb(null, psOutput, '');
    }) as any);

    const adapter = new WindowsDiskSpaceAdapter();
    const candidates = await adapter.listCandidates();

    expect(candidates).toEqual([{ path: 'C:\\', freeBytes: 50_000_000_000 }]);
  });

  it('rejects when PowerShell exits with an error', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => {
      cb(new Error('powershell not found'), '', 'powershell not found');
    }) as any);

    const adapter = new WindowsDiskSpaceAdapter();
    await expect(adapter.listCandidates()).rejects.toThrow('powershell not found');
  });
});
