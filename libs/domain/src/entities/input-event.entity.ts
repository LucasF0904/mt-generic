export type InputEventKind = 'click' | 'keydown' | 'window';

/**
 * One entry from a session's `input-events.jsonl` (design spec §7/§9): a
 * click, a raw keydown (only present when the session opted in), or an
 * active-window change. `data` is intentionally loose — each kind carries a
 * different shape (x/y/button, keycode, title/appName) and this entity's job
 * is faithful (de)serialization, not per-kind business rules.
 */
export class InputEvent {
  constructor(
    public readonly kind: InputEventKind,
    public readonly timestamp: Date,
    public readonly data: Record<string, number | string>,
  ) {
    if (Number.isNaN(timestamp.getTime())) {
      throw new Error('InputEvent.timestamp must be a valid Date');
    }
  }
}
