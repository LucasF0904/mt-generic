import { describe, expect, it } from 'vitest';
import { MachineConfig } from './machine-config.entity';

describe('MachineConfig', () => {
  it('stores the storage root and the resolution timestamp', () => {
    const resolvedAt = new Date('2026-08-26T10:00:00Z');
    const config = new MachineConfig('Z:\\MeetingAI', resolvedAt);
    expect(config.storageRoot).toBe('Z:\\MeetingAI');
    expect(config.resolvedAt).toBe(resolvedAt);
  });

  it('rejects an empty storage root', () => {
    expect(() => new MachineConfig('', new Date())).toThrow('MachineConfig.storageRoot must not be empty');
  });

  it('rejects a whitespace-only storage root', () => {
    expect(() => new MachineConfig('   ', new Date())).toThrow('MachineConfig.storageRoot must not be empty');
  });

  it('stores the optional OBS connection details', () => {
    const config = new MachineConfig('Z:\\MeetingAI', new Date(), 'ws://127.0.0.1:4455', 'secret');
    expect(config.obsUrl).toBe('ws://127.0.0.1:4455');
    expect(config.obsPassword).toBe('secret');
  });

  it('leaves obsUrl/obsPassword undefined when not given', () => {
    const config = new MachineConfig('Z:\\MeetingAI', new Date());
    expect(config.obsUrl).toBeUndefined();
    expect(config.obsPassword).toBeUndefined();
  });
});
