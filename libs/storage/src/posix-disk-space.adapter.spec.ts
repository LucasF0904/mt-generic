import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { PosixDiskSpaceAdapter } from './posix-disk-space.adapter';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const DF_OUTPUT = [
  'Filesystem     1024-blocks      Used Available Capacity  Mounted on',
  '/dev/disk3s1s1   239331776  12342908  28262216      31%  /',
  'devfs                  204       204         0     100%  /dev',
  'map auto_home            0         0         0     100%  /System/Volumes/Data/home',
  '/dev/disk3s5     239331776 188119156  28262216      87%  /System/Volumes/Data',
  '/dev/disk7s1     468646704 349133356 119358088      75%  /Volumes/ExternalDisk',
  '',
].join('\n');

describe('PosixDiskSpaceAdapter', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  const stubDf = (output: string) => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => {
      cb(null, output, '');
    }) as any);
  };

  it('queries df in POSIX mode with 1024-byte blocks', async () => {
    stubDf(DF_OUTPUT);

    await new PosixDiskSpaceAdapter().listCandidates();

    expect(execFile).toHaveBeenCalledWith('df', ['-kP'], expect.any(Function));
  });

  it('keeps only the root volume and /Volumes mounts, converting 1024-blocks to bytes', async () => {
    stubDf(DF_OUTPUT);

    const candidates = await new PosixDiskSpaceAdapter().listCandidates();

    expect(candidates).toEqual([
      { path: '/', freeBytes: 28262216 * 1024 },
      { path: '/Volumes/ExternalDisk', freeBytes: 119358088 * 1024 },
    ]);
  });

  it('parses rows whose filesystem column contains a space', async () => {
    stubDf(
      [
        'Filesystem 1024-blocks Used Available Capacity Mounted on',
        'map auto_home 0 0 0 100% /Volumes/net home',
        '',
      ].join('\n'),
    );

    const candidates = await new PosixDiskSpaceAdapter().listCandidates();

    expect(candidates).toEqual([{ path: '/Volumes/net home', freeBytes: 0 }]);
  });

  it('rejects when df exits with an error', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], cb: any) => {
      cb(new Error('df: command not found'), '', 'df: command not found');
    }) as any);

    await expect(new PosixDiskSpaceAdapter().listCandidates()).rejects.toThrow('df: command not found');
  });
});
