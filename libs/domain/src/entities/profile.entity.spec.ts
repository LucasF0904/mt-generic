import { describe, expect, it } from 'vitest';
import { Profile } from './profile.entity';

describe('Profile', () => {
  it('defaults notesFolder to Meetings', () => {
    const profile = new Profile('Demo', 'Z:\\Development\\Personal\\Projeto-Demo\\demo-docs');
    expect(profile.name).toBe('Demo');
    expect(profile.vaultDirectory).toBe('Z:\\Development\\Personal\\Projeto-Demo\\demo-docs');
    expect(profile.notesFolder).toBe('Meetings');
  });

  it('accepts a custom notesFolder', () => {
    const profile = new Profile('Pessoal', 'Z:\\.segundo-cerebro-personal', 'Reunioes');
    expect(profile.notesFolder).toBe('Reunioes');
  });

  it('allows an undefined vaultDirectory for a profile with no segundo-cérebro', () => {
    const profile = new Profile('Equipe');
    expect(profile.vaultDirectory).toBeUndefined();
    expect(profile.notesFolder).toBe('Meetings');
  });

  it('rejects an empty name', () => {
    expect(() => new Profile('', 'Z:\\some\\path')).toThrow('Profile.name must not be empty');
  });

  it('rejects an empty-string vaultDirectory (use undefined instead)', () => {
    expect(() => new Profile('Demo', '')).toThrow('Profile.vaultDirectory must not be empty when provided');
  });
});
