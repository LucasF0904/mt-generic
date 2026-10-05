import { execFile } from 'node:child_process';
import { DiskCandidate, DiskSpaceAdapter } from './disk-space.adapter';

// `df -kP` (POSIX mode) prints one row per filesystem, sizes in 1024-byte blocks:
//   Filesystem  1024-blocks  Used  Available  Capacity  Mounted on
// Both the filesystem name and the mount path can contain spaces (e.g.
// `map auto_home`, `/Volumes/My Disk`), so each row is matched around its fixed
// numeric block instead of split on whitespace.
const DF_ROW = /^.+?\s+\d+\s+\d+\s+(\d+)\s+\d+%\s+(.+)$/;

/**
 * Disk-space discovery for macOS (and other POSIX hosts) via `df`. Only real
 * volumes are offered as candidates — the root filesystem and anything mounted
 * under `/Volumes` — so pseudo-filesystems (`devfs`, `/System/Volumes/*`, temp
 * overlays) never win the "most free space" pick in StorageService.
 */
export class PosixDiskSpaceAdapter implements DiskSpaceAdapter {
  async listCandidates(): Promise<DiskCandidate[]> {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('df', ['-kP'], (error, out) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(out);
      });
    });

    return stdout
      .split('\n')
      .slice(1)
      .map((line) => DF_ROW.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ path: match[2], freeBytes: Number(match[1]) * 1024 }))
      .filter((candidate) => candidate.path === '/' || candidate.path.startsWith('/Volumes/'));
  }
}
