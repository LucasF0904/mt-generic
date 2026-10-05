import { describe, expect, it } from 'vitest';
import { InputEvent } from './input-event.entity';

describe('InputEvent', () => {
  it('stores kind, timestamp and the kind-specific data payload', () => {
    const timestamp = new Date('2026-09-03T21:30:05.000Z');

    const click = new InputEvent('click', timestamp, { x: 120, y: 340, button: 1 });

    expect(click.kind).toBe('click');
    expect(click.timestamp).toBe(timestamp);
    expect(click.data).toEqual({ x: 120, y: 340, button: 1 });
  });

  it('rejects an invalid timestamp', () => {
    expect(() => new InputEvent('window', new Date('not-a-date'), {})).toThrow(
      'InputEvent.timestamp must be a valid Date',
    );
  });
});
