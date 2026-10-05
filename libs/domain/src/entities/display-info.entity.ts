import { AudioMode } from '../value-objects/audio-mode.value-object';

export class DisplayInfo {
  constructor(
    public readonly monitorIndex: number,
    public readonly monitorName: string,
  ) {}

  sceneName(audioMode: AudioMode): string {
    const suffix = audioMode === AudioMode.MeetingWithMic ? 'Reuniao-Mic' : 'Reuniao';
    return `DISPLAY${this.monitorIndex + 1}-${suffix}`;
  }
}
