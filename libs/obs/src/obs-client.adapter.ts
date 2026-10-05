export interface ObsMonitor {
  monitorIndex: number;
  monitorName: string;
  captureId: string;
}

export interface ObsClientAdapter {
  connect(url?: string, password?: string): Promise<void>;
  disconnect(): Promise<void>;
  assertIdle(): Promise<void>;
  listMonitors(): Promise<ObsMonitor[]>;
  listScenes(): Promise<string[]>;
  createScene(sceneName: string): Promise<void>;
  ensureDisplayCaptureInput(sceneName: string, inputName: string, monitor: ObsMonitor): Promise<void>;
  ensureAudioInputs(sceneName: string, withMic: boolean): Promise<void>;
  setRecordDirectory(directory: string): Promise<void>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
  startRecord(): Promise<void>;
  stopRecord(): Promise<{ outputPath: string }>;
}

export const OBS_CLIENT_ADAPTER = Symbol('OBS_CLIENT_ADAPTER');
