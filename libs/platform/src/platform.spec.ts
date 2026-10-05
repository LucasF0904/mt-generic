import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform', () => {
  it('maps win32 to "windows"', () => {
    expect(detectPlatform('win32')).toBe('windows');
  });

  it('maps darwin to "macos"', () => {
    expect(detectPlatform('darwin')).toBe('macos');
  });

  it('throws with the offending platform name on an unsupported OS', () => {
    expect(() => detectPlatform('linux')).toThrow('plataforma "linux" não é suportada');
  });

  it('falls back to the current process platform when no argument is given', () => {
    expect(['windows', 'macos']).toContain(detectPlatform());
  });
});
