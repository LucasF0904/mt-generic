import { describe, expect, it } from 'vitest';
import { FrameAnalysis } from './frame-analysis.entity';

describe('FrameAnalysis', () => {
  it('stores the timestamp and description', () => {
    const frame = new FrameAnalysis(12.5, 'Slide com o roadmap do Q3 visível.');

    expect(frame.timestampSeconds).toBe(12.5);
    expect(frame.description).toBe('Slide com o roadmap do Q3 visível.');
  });

  it('allows a zero timestamp', () => {
    expect(() => new FrameAnalysis(0, 'x')).not.toThrow();
  });

  it('rejects a negative timestamp', () => {
    expect(() => new FrameAnalysis(-1, 'x')).toThrow('must be a non-negative finite number');
  });

  it('rejects a non-finite timestamp', () => {
    expect(() => new FrameAnalysis(Number.NaN, 'x')).toThrow('must be a non-negative finite number');
  });
});
