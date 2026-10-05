import { promises as fs } from 'node:fs';
import { InputEvent, InputEventKind } from '@mt/domain';

interface InputEventLine {
  kind: InputEventKind;
  timestamp: string;
  data: Record<string, number | string>;
}

/**
 * Parses a session's input-events.jsonl (design spec §7). Tolerant by
 * design, matching listPending's approach to a Staging entry: no path at
 * all, a missing file (logger never produced output), or one corrupt line
 * all degrade to "fewer events", never an exception — a best-effort
 * enrichment log must not be able to break `mt process`.
 */
export async function readInputEvents(inputEventsPath: string | undefined): Promise<InputEvent[]> {
  if (!inputEventsPath) {
    return [];
  }

  let raw: string;
  try {
    raw = await fs.readFile(inputEventsPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const events: InputEvent[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as InputEventLine;
      events.push(new InputEvent(parsed.kind, new Date(parsed.timestamp), parsed.data));
    } catch {
      continue;
    }
  }
  return events;
}
