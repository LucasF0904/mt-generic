import { formatTimestamp, FrameAnalysis, InputEvent, RecordingSession, Transcript } from '@mt/domain';

export type TimelineEntry =
  | { kind: 'transcript'; atSeconds: number; text: string }
  | { kind: 'input'; atSeconds: number; event: InputEvent }
  | { kind: 'frame'; atSeconds: number; description: string };

/**
 * Input events carry wall-clock `Date` timestamps; transcript segments and
 * frame analyses are relative seconds from the start of the recording. There
 * is no stored "recording started" timestamp (`RecordingSession.recordedAt`
 * is set when staging happens, after the recording already ended), so this
 * approximates it from the earliest logged input event — which starts almost
 * exactly when OBS recording does, since `mt record` starts both back to
 * back. With no input events at all (logging never ran or crashed), input
 * events don't factor into the merge anyway, so `recordedAt` itself is a
 * safe fallback.
 */
export function estimateRecordingStart(session: RecordingSession, inputEvents: InputEvent[]): Date {
  if (inputEvents.length === 0) {
    return session.recordedAt;
  }
  return inputEvents.reduce(
    (earliest, event) => (event.timestamp < earliest ? event.timestamp : earliest),
    inputEvents[0].timestamp,
  );
}

/** Merges the three timelines chronologically (design spec §9 "Correlação"). */
export function buildTimeline(
  transcript: Transcript,
  inputEvents: InputEvent[],
  frames: FrameAnalysis[],
  recordingStartedAt: Date,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const segment of transcript.segments) {
    const text = segment.text.trim();
    if (text.length > 0) {
      entries.push({ kind: 'transcript', atSeconds: segment.startSeconds, text });
    }
  }
  for (const event of inputEvents) {
    const atSeconds = (event.timestamp.getTime() - recordingStartedAt.getTime()) / 1000;
    entries.push({ kind: 'input', atSeconds, event });
  }
  for (const frame of frames) {
    entries.push({ kind: 'frame', atSeconds: frame.timestampSeconds, description: frame.description });
  }

  return entries.sort((a, b) => a.atSeconds - b.atSeconds);
}

function describeInputEvent(event: InputEvent): string {
  if (event.kind === 'click') {
    return `clique em (${event.data.x}, ${event.data.y})`;
  }
  if (event.kind === 'window') {
    const title = event.data.title ? ` — ${event.data.title}` : '';
    return `janela ativa: ${event.data.appName}${title}`;
  }
  return 'tecla pressionada';
}

/** Renders a merged timeline as plain text for the synthesis prompt. */
export function timelineToText(entries: TimelineEntry[]): string {
  return entries
    .map((entry) => {
      const t = formatTimestamp(entry.atSeconds);
      if (entry.kind === 'transcript') {
        return `[${t}] fala: ${entry.text}`;
      }
      if (entry.kind === 'frame') {
        return `[${t}] tela: ${entry.description}`;
      }
      return `[${t}] ${describeInputEvent(entry.event)}`;
    })
    .join('\n');
}
