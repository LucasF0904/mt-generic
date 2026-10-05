import { describe, expect, it } from 'vitest';
import { formatTimestamp } from './format-timestamp';

describe('formatTimestamp', () => {
  it('formats seconds under a minute', () => {
    expect(formatTimestamp(5)).toBe('00:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(65)).toBe('01:05');
  });

  it('rounds to the nearest second', () => {
    expect(formatTimestamp(59.6)).toBe('01:00');
  });

  it('clamps a negative value to 00:00', () => {
    expect(formatTimestamp(-5)).toBe('00:00');
  });
});
