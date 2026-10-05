import { describe, expect, it } from 'vitest';
import { DisplayInfo } from './display-info.entity';
import { AudioMode } from '../value-objects/audio-mode.value-object';

describe('DisplayInfo', () => {
  it('names the scene DISPLAY<n>-Reuniao for the primary monitor without mic', () => {
    const display = new DisplayInfo(0, 'Primary Monitor');
    expect(display.sceneName(AudioMode.Meeting)).toBe('DISPLAY1-Reuniao');
  });

  it('names the scene DISPLAY<n>-Reuniao-Mic when mic mode is requested', () => {
    const display = new DisplayInfo(1, 'Secondary Monitor');
    expect(display.sceneName(AudioMode.MeetingWithMic)).toBe('DISPLAY2-Reuniao-Mic');
  });
});
