export interface DiskCandidate {
  path: string;
  freeBytes: number;
}

export interface DiskSpaceAdapter {
  listCandidates(): Promise<DiskCandidate[]>;
}

export const DISK_SPACE_ADAPTER = Symbol('DISK_SPACE_ADAPTER');
