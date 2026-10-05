import { execFile } from 'node:child_process';
import { DiskCandidate, DiskSpaceAdapter } from './disk-space.adapter';

interface PsDrive {
  Name: string;
  Free: number;
}

export class WindowsDiskSpaceAdapter implements DiskSpaceAdapter {
  async listCandidates(): Promise<DiskCandidate[]> {
    const script =
      'Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null } | ' +
      'Select-Object Name, Free | ConvertTo-Json -Compress';

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        (error, out) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(out);
        },
      );
    });

    const parsed: PsDrive | PsDrive[] = JSON.parse(stdout);
    const drives = Array.isArray(parsed) ? parsed : [parsed];

    return drives.map((drive) => ({
      path: `${drive.Name}:\\`,
      freeBytes: drive.Free,
    }));
  }
}
