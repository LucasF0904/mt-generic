import { Inject, Injectable } from '@nestjs/common';
import { AudioMode, DisplayInfo } from '@mt/domain';
import { ObsClientAdapter, OBS_CLIENT_ADAPTER } from './obs-client.adapter';

@Injectable()
export class ObsService {
  constructor(@Inject(OBS_CLIENT_ADAPTER) private readonly client: ObsClientAdapter) {}

  async testConnection(url?: string, password?: string): Promise<boolean> {
    try {
      await this.client.connect(url, password);
      await this.client.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  async configureScenes(storageRoot: string, url?: string, password?: string): Promise<DisplayInfo[]> {
    await this.client.connect(url, password);
    try {
      await this.client.assertIdle();
      const monitors = await this.client.listMonitors();
      if (monitors.length === 0) throw new Error('Nenhum monitor disponível para captura. Confira as telas conectadas e as permissões do OBS.');
      const displays = monitors.map((monitor) => new DisplayInfo(monitor.monitorIndex, monitor.monitorName));
      const existingScenes = await this.client.listScenes();

      for (const display of displays) {
        for (const audioMode of [AudioMode.Meeting, AudioMode.MeetingWithMic]) {
          const sceneName = display.sceneName(audioMode);
          if (!existingScenes.includes(sceneName)) {
            await this.client.createScene(sceneName);
          }
          const monitor = monitors.find((item) => item.monitorIndex === display.monitorIndex)!;
          await this.client.ensureDisplayCaptureInput(sceneName, `${sceneName}-Capture`, monitor);
          await this.client.ensureAudioInputs(sceneName, audioMode === AudioMode.MeetingWithMic);
        }
      }

      await this.client.setRecordDirectory(storageRoot);
      return displays;
    } finally {
      await this.client.disconnect();
    }
  }

  async listMonitors(url?: string, password?: string): Promise<DisplayInfo[]> {
    await this.client.connect(url, password);
    try {
      const monitors = await this.client.listMonitors();
      return monitors.map((monitor) => new DisplayInfo(monitor.monitorIndex, monitor.monitorName));
    } finally {
      await this.client.disconnect();
    }
  }

  async startRecording(sceneName: string, url?: string, password?: string): Promise<void> {
    await this.client.connect(url, password);
    try {
      await this.client.assertIdle();
      await this.client.setCurrentProgramScene(sceneName);
      await this.client.startRecord();
    } finally {
      await this.client.disconnect();
    }
  }

  async stopRecording(url?: string, password?: string): Promise<string> {
    await this.client.connect(url, password);
    try {
      const { outputPath } = await this.client.stopRecord();
      return outputPath;
    } finally {
      await this.client.disconnect();
    }
  }
}
