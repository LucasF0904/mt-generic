import { randomUUID } from 'node:crypto';
import OBSWebSocket from 'obs-websocket-js';
import { SupportedPlatform } from '@mt/platform';
import { ObsClientAdapter, ObsMonitor } from './obs-client.adapter';
import { ObsLocalEnvironment } from './obs-local-environment';

export class ObsWebsocketAdapter implements ObsClientAdapter {
  private readonly client = new OBSWebSocket();
  private readonly environment: ObsLocalEnvironment;
  private readonly globalMutes = new Map<string, boolean>();

  constructor(private readonly platform: SupportedPlatform) {
    this.environment = new ObsLocalEnvironment(platform);
  }

  async connect(url?: string, password?: string): Promise<void> {
    let connection = await this.environment.resolveConnection(url, password);
    try {
      await this.client.connect(connection.url, connection.password);
      return;
    } catch (error) {
      await this.client.disconnect();
      if (!/ECONNREFUSED/.test((error as Error).message)) {
        throw new Error('Não foi possível autenticar/conectar ao OBS. Confira --obs-url e --obs-password no mt setup.', { cause: error });
      }
    }
    await this.environment.ensureRunning(connection.url);
    // A first launch may have just provisioned authentication.
    connection = await this.environment.resolveConnection(url, password);
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        await this.client.connect(connection.url, connection.password);
        return;
      } catch (error) {
        await this.client.disconnect();
        if (!/ECONNREFUSED/.test((error as Error).message)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error('OBS não ficou disponível em 45s. Confira diálogos de inicialização e Tools > WebSocket Server Settings no OBS.');
  }

  async disconnect(): Promise<void> { await this.client.disconnect(); }

  async assertIdle(): Promise<void> {
    for (const request of ['GetRecordStatus', 'GetStreamStatus', 'GetReplayBufferStatus'] as const) {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await this.client.call(request);
          if (result.outputActive) throw new Error('OBS ocupado: pare a gravação, transmissão ou replay buffer antes de configurar.');
          break;
        } catch (error) {
          const code = (error as { code?: number }).code;
          if (request === 'GetReplayBufferStatus' && (code === 604 || code === 504)) break;
          // WebSocket authentication may finish before OBS loads the scene collection.
          if (code === 207 && attempt < 60) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
          throw error;
        }
      }
    }
  }

  async listMonitors(): Promise<ObsMonitor[]> {
    if (this.platform === 'macos') return this.environment.listMacMonitors();
    // The source's own property values are device IDs; GetMonitorList indexes
    // (Qt screen order) are not valid values for monitor_id.
    const sceneName = `mt-discovery-${randomUUID()}`;
    const inputName = `${sceneName}-capture`;
    await this.client.call('CreateScene', { sceneName });
    try {
      await this.client.call('CreateInput', { sceneName, inputName, inputKind: 'monitor_capture', sceneItemEnabled: false });
      const { propertyItems } = await this.client.call('GetInputPropertiesListPropertyItems', { inputName, propertyName: 'monitor_id' });
      return propertyItems
        .filter((item) => item.itemEnabled !== false && typeof item.itemValue === 'string' && item.itemValue !== '')
        .map((item, index) => ({ monitorIndex: index, monitorName: String(item.itemName), captureId: String(item.itemValue) }));
    } finally {
      await this.client.call('RemoveScene', { sceneName });
    }
  }

  async listScenes(): Promise<string[]> {
    const { scenes } = await this.client.call('GetSceneList');
    return scenes.map((scene) => String(scene.sceneName));
  }

  async createScene(sceneName: string): Promise<void> { await this.client.call('CreateScene', { sceneName }); }

  async ensureDisplayCaptureInput(sceneName: string, inputName: string, monitor: ObsMonitor): Promise<void> {
    if (!monitor.captureId) throw new Error(`Monitor sem identificador de captura: ${monitor.monitorName}`);
    const inputKind = this.platform === 'macos' ? 'screen_capture' : 'monitor_capture';
    const inputSettings: Record<string, string | number> = this.platform === 'macos'
      ? { type: 0, display_uuid: monitor.captureId }
      : { monitor_id: monitor.captureId };
    const { inputs } = await this.client.call('GetInputList');
    let existing = inputs.find((input) => input.inputName === inputName);
    if (existing && existing.inputKind !== inputKind) {
      // Only the reserved source name for this mt scene is replaced.
      const obsoleteName = `${inputName}-obsolete-${randomUUID()}`;
      await this.client.call('SetInputName', { inputName, newInputName: obsoleteName });
      const { sceneItems } = await this.client.call('GetSceneItemList', { sceneName });
      for (const item of sceneItems.filter((candidate) => candidate.sourceName === obsoleteName)) {
        await this.client.call('RemoveSceneItem', { sceneName, sceneItemId: Number(item.sceneItemId) });
      }
      await this.client.call('RemoveInput', { inputName: obsoleteName });
      existing = undefined;
    }
    let sceneItemId: number;
    if (!existing) {
      ({ sceneItemId } = await this.client.call('CreateInput', { sceneName, inputName, inputKind, inputSettings, sceneItemEnabled: true }));
    } else {
      await this.client.call('SetInputSettings', { inputName, inputSettings, overlay: true });
      const { sceneItems } = await this.client.call('GetSceneItemList', { sceneName });
      const item = sceneItems.find((candidate) => candidate.sourceName === inputName);
      if (item) sceneItemId = Number(item.sceneItemId);
      else ({ sceneItemId } = await this.client.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true }));
    }
    const { baseWidth, baseHeight } = await this.client.call('GetVideoSettings');
    await this.client.call('SetSceneItemTransform', {
      sceneName, sceneItemId, sceneItemTransform: {
        positionX: 0, positionY: 0, rotation: 0, alignment: 5,
        scaleX: 1, scaleY: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
        boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: baseWidth, boundsHeight: baseHeight,
      },
    });
    await this.client.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
  }

  async ensureAudioInputs(sceneName: string, withMic: boolean): Promise<void> {
    if (this.platform === 'windows') {
      await this.ensureAudioSource(sceneName, 'mt-DesktopAudio', 'wasapi_output_capture');
    }
    // macOS screen_capture includes system audio via ScreenCaptureKit.
    if (withMic) {
      await this.ensureAudioSource(sceneName, 'mt-Microphone', this.platform === 'macos' ? 'coreaudio_input_capture' : 'wasapi_input_capture');
    }
  }

  private async ensureAudioSource(sceneName: string, inputName: string, inputKind: string): Promise<void> {
    const { inputs } = await this.client.call('GetInputList');
    if (!inputs.some((input) => input.inputName === inputName)) {
      await this.client.call('CreateInput', { sceneName, inputName, inputKind, inputSettings: { device_id: 'default' }, sceneItemEnabled: true });
    } else {
      const { sceneItems } = await this.client.call('GetSceneItemList', { sceneName });
      const item = sceneItems.find((candidate) => candidate.sourceName === inputName);
      if (!item) await this.client.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true });
      else await this.client.call('SetSceneItemEnabled', { sceneName, sceneItemId: Number(item.sceneItemId), sceneItemEnabled: true });
    }
  }

  async setRecordDirectory(directory: string): Promise<void> {
    await this.client.call('SetRecordDirectory', { recordDirectory: directory });
  }

  async setCurrentProgramScene(sceneName: string): Promise<void> {
    await this.client.call('SetCurrentProgramScene', { sceneName });
  }

  async startRecord(): Promise<void> {
    try {
      // Global OBS devices bypass scene selection. Silence them during mt
      // recording so the per-scene microphone choice is respected.
      const special = await this.client.call('GetSpecialInputs');
      for (const inputName of new Set(Object.values(special).filter((name): name is string => typeof name === 'string'))) {
        const { inputMuted } = await this.client.call('GetInputMute', { inputName });
        this.globalMutes.set(inputName, inputMuted);
        await this.client.call('SetInputMute', { inputName, inputMuted: true });
      }
      await this.client.call('StartRecord');
    } catch (error) {
      await this.restoreGlobalAudio();
      throw error;
    }
  }

  private async restoreGlobalAudio(): Promise<void> {
    for (const [inputName, inputMuted] of this.globalMutes) {
      await this.client.call('SetInputMute', { inputName, inputMuted });
      this.globalMutes.delete(inputName);
    }
  }

  async stopRecord(): Promise<{ outputPath: string }> {
    const { outputPath } = await this.client.call('StopRecord');
    // StopRecord acknowledges the request before OBS closes the output file.
    const deadline = Date.now() + 15000;
    while ((await this.client.call('GetRecordStatus')).outputActive) {
      if (Date.now() >= deadline) throw new Error('OBS ainda está finalizando a gravação. Confira o OBS antes de mover o arquivo.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await this.restoreGlobalAudio();
    return { outputPath };
  }
}
