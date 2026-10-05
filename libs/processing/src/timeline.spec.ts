import { describe, expect, it } from 'vitest';
import {
  AudioMode,
  FrameAnalysis,
  InputEvent,
  RecordingSession,
  Transcript,
  TranscriptSegment,
} from '@mt/domain';
import { buildTimeline, estimateRecordingStart, timelineToText } from './timeline';

const session = new RecordingSession(
  '2026-09-03T21-30-00-000Z',
  'equipe',
  0,
  AudioMode.Meeting,
  new Date('2026-09-03T21:35:00.000Z'), // recordedAt is set at staging time, after recording ends
  '/srv/S/recording.mkv',
);

describe('estimateRecordingStart', () => {
  it('falls back to session.recordedAt when there are no input events', () => {
    expect(estimateRecordingStart(session, [])).toEqual(session.recordedAt);
  });

  it('uses the earliest input event timestamp when events exist', () => {
    const events = [
      new InputEvent('window', new Date('2026-09-03T21:30:05.000Z'), {}),
      new InputEvent('click', new Date('2026-09-03T21:30:02.000Z'), { x: 0, y: 0, button: 1 }),
    ];

    expect(estimateRecordingStart(session, events)).toEqual(new Date('2026-09-03T21:30:02.000Z'));
  });
});

describe('buildTimeline', () => {
  const recordingStartedAt = new Date('2026-09-03T21:30:00.000Z');

  it('merges transcript, input and frame entries into chronological order', () => {
    const transcript = new Transcript('pt', [
      new TranscriptSegment(5, 8, 'bom dia'),
      new TranscriptSegment(0, 2, '   '), // blank text is dropped
    ]);
    const events = [new InputEvent('click', new Date('2026-09-03T21:30:03.000Z'), { x: 1, y: 2, button: 1 })];
    const frames = [new FrameAnalysis(1, 'slide inicial')];

    const timeline = buildTimeline(transcript, events, frames, recordingStartedAt);

    expect(timeline.map((e) => e.kind)).toEqual(['frame', 'input', 'transcript']);
    expect(timeline.map((e) => e.atSeconds)).toEqual([1, 3, 5]);
  });
});

describe('timelineToText', () => {
  it('renders each entry kind with a mm:ss timestamp', () => {
    const timeline = buildTimeline(
      new Transcript('pt', [new TranscriptSegment(65, 67, 'depois de um minuto')]),
      [
        new InputEvent('click', new Date('2026-09-03T21:30:02.000Z'), { x: 10, y: 20, button: 1 }),
        new InputEvent('window', new Date('2026-09-03T21:30:03.000Z'), { appName: 'OBS', title: 'Cena principal' }),
        new InputEvent('keydown', new Date('2026-09-03T21:30:04.000Z'), { keycode: 57 }),
      ],
      [new FrameAnalysis(1, 'tela inicial do OBS')],
      new Date('2026-09-03T21:30:00.000Z'),
    );

    const text = timelineToText(timeline);

    expect(text).toBe(
      [
        '[00:01] tela: tela inicial do OBS',
        '[00:02] clique em (10, 20)',
        '[00:03] janela ativa: OBS — Cena principal',
        '[00:04] tecla pressionada',
        '[01:05] fala: depois de um minuto',
      ].join('\n'),
    );
  });

  it('omits the dash and title for a window event with no title', () => {
    const timeline = buildTimeline(
      new Transcript('pt', []),
      [new InputEvent('window', new Date('2026-09-03T21:30:00.000Z'), { appName: 'Finder', title: '' })],
      [],
      new Date('2026-09-03T21:30:00.000Z'),
    );

    expect(timelineToText(timeline)).toBe('[00:00] janela ativa: Finder');
  });
});
