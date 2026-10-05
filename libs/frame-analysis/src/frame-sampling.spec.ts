import { describe, expect, it } from 'vitest';
import { fillGapsWithFallback } from './frame-sampling';

describe('fillGapsWithFallback', () => {
  it('always includes t=0 even with no scene changes and a short video', () => {
    expect(fillGapsWithFallback([], 1, 1.5)).toEqual([0]);
  });

  it('keeps every scene change as-is when gaps are already within the max', () => {
    expect(fillGapsWithFallback([1, 2, 3], 4, 1.5)).toEqual([0, 1, 2, 3]);
  });

  it('inserts fallback timestamps into a gap between two scene changes', () => {
    // gap from 1 -> 6 is 5s, larger than the 1.5s max: fill with 2.5, 4, 5.5 before landing on 6.
    expect(fillGapsWithFallback([1, 6], 6, 1.5)).toEqual([0, 1, 2.5, 4, 5.5, 6]);
  });

  it('fills the gap from the last scene change to the end of the video', () => {
    expect(fillGapsWithFallback([1], 5, 1.5)).toEqual([0, 1, 2.5, 4]);
  });

  it('fills the gap from t=0 to the first scene change', () => {
    expect(fillGapsWithFallback([5], 5, 1.5)).toEqual([0, 1.5, 3, 4.5, 5]);
  });

  it('drops duplicates, negatives and anything past the video duration', () => {
    // valid, deduped input is just [2]; gap 0 -> 2 exceeds 1.5s, so a fallback lands at 1.5.
    expect(fillGapsWithFallback([2, 2, -1, 100], 3, 1.5)).toEqual([0, 1.5, 2]);
  });

  it('deals with an empty, zero-length video without looping forever', () => {
    expect(fillGapsWithFallback([], 0, 1.5)).toEqual([0]);
  });
});
