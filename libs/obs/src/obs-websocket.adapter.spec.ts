import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObsWebsocketAdapter } from './obs-websocket.adapter';

const { mockCall, mockConnect, mockDisconnect, nativeMonitors, ensureRunning } = vi.hoisted(() => ({
  mockCall: vi.fn(), mockConnect: vi.fn(), mockDisconnect: vi.fn(), nativeMonitors: vi.fn(), ensureRunning: vi.fn(),
}));
vi.mock('obs-websocket-js', () => ({ default: vi.fn().mockImplementation(() => ({
  connect: mockConnect, disconnect: mockDisconnect, call: mockCall,
})) }));
vi.mock('./obs-local-environment', () => ({ ObsLocalEnvironment: vi.fn().mockImplementation(() => ({
  resolveConnection: async (url?: string, password?: string) => ({ url: url ?? 'ws://127.0.0.1:4455', password }),
  listMacMonitors: nativeMonitors, ensureRunning,
})) }));

const display = { monitorIndex: 1, monitorName: 'Dell external', captureId: 'UUID-EXTERNAL' };

describe('ObsWebsocketAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.mockImplementation(async (request: string) => {
      switch (request) {
        case 'GetInputList': return { inputs: [] };
        case 'GetSceneItemList': return { sceneItems: [] };
        case 'CreateInput': case 'CreateSceneItem': return { sceneItemId: 17 };
        case 'GetVideoSettings': return { baseWidth: 1920, baseHeight: 1080 };
        case 'GetRecordStatus': case 'GetStreamStatus': case 'GetReplayBufferStatus': return { outputActive: false };
        default: return {};
      }
    });
  });

  it('connects with an explicit url and password', async () => {
    await new ObsWebsocketAdapter('windows').connect('ws://host:4455', 'secret');
    expect(mockConnect).toHaveBeenCalledWith('ws://host:4455', 'secret');
  });

  it('opens local OBS and retries when the socket is initially refused', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect ECONNREFUSED')).mockResolvedValue(undefined);
    await new ObsWebsocketAdapter('macos').connect();
    expect(ensureRunning).toHaveBeenCalledWith('ws://127.0.0.1:4455');
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('does not launch or reconfigure OBS for an authentication failure', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Authentication failed'));
    await expect(new ObsWebsocketAdapter('macos').connect(undefined, 'wrong')).rejects.toThrow(/autenticar/);
    expect(ensureRunning).not.toHaveBeenCalled();
  });

  it('waits for OBS initialization after websocket authentication before changing scenes', async () => {
    vi.useFakeTimers();
    try {
      mockCall.mockRejectedValueOnce(Object.assign(new Error('OBS is not ready'), { code: 207 }));
      let done = false;
      const request = new ObsWebsocketAdapter('macos').assertIdle().then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(500);
      expect(done).toBe(true); await request;
      expect(mockCall.mock.calls.filter(([request]) => request === 'GetRecordStatus')).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it('enumerates macOS displays with native UUIDs, including identical display names', async () => {
    nativeMonitors.mockResolvedValue([
      { monitorIndex: 0, monitorName: 'Dell', captureId: 'UUID-A' },
      { monitorIndex: 1, monitorName: 'Dell', captureId: 'UUID-B' },
    ]);
    expect(await new ObsWebsocketAdapter('macos').listMonitors()).toEqual([
      { monitorIndex: 0, monitorName: 'Dell', captureId: 'UUID-A' },
      { monitorIndex: 1, monitorName: 'Dell', captureId: 'UUID-B' },
    ]);
    expect(mockCall).not.toHaveBeenCalledWith('GetInputPropertiesListPropertyItems', expect.anything());
  });

  it('uses Windows property values, omitting disabled or empty monitor choices', async () => {
    mockCall.mockResolvedValueOnce({}).mockResolvedValueOnce({ sceneItemId: 1 }).mockResolvedValueOnce({ propertyItems: [
      { itemName: 'Select...', itemValue: '', itemEnabled: true },
      { itemName: 'Disconnected', itemValue: 'OLD', itemEnabled: false },
      { itemName: 'Dell left', itemValue: '\\\\?\\DISPLAY#LEFT', itemEnabled: true },
      { itemName: 'Dell right', itemValue: '\\\\?\\DISPLAY#RIGHT', itemEnabled: true },
    ] });
    expect(await new ObsWebsocketAdapter('windows').listMonitors()).toEqual([
      { monitorIndex: 0, monitorName: 'Dell left', captureId: '\\\\?\\DISPLAY#LEFT' },
      { monitorIndex: 1, monitorName: 'Dell right', captureId: '\\\\?\\DISPLAY#RIGHT' },
    ]);
    expect(mockCall).toHaveBeenLastCalledWith('RemoveScene', expect.anything());
  });

  it('creates macOS ScreenCaptureKit with a valid UUID and fits the canvas', async () => {
    await new ObsWebsocketAdapter('macos').ensureDisplayCaptureInput('DISPLAY2-Reuniao', 'DISPLAY2-Reuniao-Capture', display);
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({
      inputKind: 'screen_capture', inputSettings: { type: 0, display_uuid: 'UUID-EXTERNAL' },
    }));
    expect(mockCall).toHaveBeenCalledWith('SetSceneItemTransform', expect.objectContaining({
      sceneItemTransform: expect.objectContaining({ boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080 }),
    }));
  });

  it('sends a string monitor_id on Windows', async () => {
    await new ObsWebsocketAdapter('windows').ensureDisplayCaptureInput('DISPLAY2-Reuniao', 'DISPLAY2-Reuniao-Capture', display);
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({
      inputKind: 'monitor_capture', inputSettings: { monitor_id: 'UUID-EXTERNAL' },
    }));
  });

  it('repairs existing sources after reconnecting a monitor without duplicating them', async () => {
    mockCall.mockImplementation(async (request: string) => {
      if (request === 'GetInputList') return { inputs: [{ inputName: 'capture', inputKind: 'screen_capture' }] };
      if (request === 'GetSceneItemList') return { sceneItems: [{ sourceName: 'capture', sceneItemId: 4 }] };
      if (request === 'GetVideoSettings') return { baseWidth: 1920, baseHeight: 1080 };
      return {};
    });
    await new ObsWebsocketAdapter('macos').ensureDisplayCaptureInput('scene', 'capture', display);
    expect(mockCall).toHaveBeenCalledWith('SetInputSettings', { inputName: 'capture', inputSettings: { type: 0, display_uuid: 'UUID-EXTERNAL' }, overlay: true });
    expect(mockCall).not.toHaveBeenCalledWith('CreateInput', expect.anything());
    expect(mockCall).not.toHaveBeenCalledWith('CreateSceneItem', expect.anything());
  });

  it('replaces an obsolete display_capture source with screen_capture', async () => {
    mockCall.mockResolvedValueOnce({ inputs: [{ inputName: 'capture', inputKind: 'display_capture' }] });
    await new ObsWebsocketAdapter('macos').ensureDisplayCaptureInput('scene', 'capture', display);
    expect(mockCall).toHaveBeenCalledWith('SetInputName', { inputName: 'capture', newInputName: expect.stringContaining('capture-obsolete-') });
    expect(mockCall).toHaveBeenCalledWith('RemoveInput', { inputName: expect.stringContaining('capture-obsolete-') });
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputKind: 'screen_capture' }));
  });

  it('creates a microphone source only for scenes that request it', async () => {
    const adapter = new ObsWebsocketAdapter('macos');
    await adapter.ensureAudioInputs('DISPLAY1-Reuniao', false);
    expect(mockCall).not.toHaveBeenCalledWith('CreateInput', expect.anything());
    await adapter.ensureAudioInputs('DISPLAY1-Reuniao-Mic', true);
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputName: 'mt-Microphone', inputKind: 'coreaudio_input_capture', inputSettings: { device_id: 'default' } }));
  });

  it('creates desktop audio and microphone capture on Windows', async () => {
    await new ObsWebsocketAdapter('windows').ensureAudioInputs('DISPLAY1-Reuniao-Mic', true);
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputKind: 'wasapi_output_capture' }));
    expect(mockCall).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputKind: 'wasapi_input_capture' }));
  });

  it('mutes global audio during mt recording and restores it on stop', async () => {
    mockCall.mockImplementation(async (request: string) => {
      if (request === 'GetSpecialInputs') return { mic1: 'Mic/Aux', desktop1: null };
      if (request === 'GetInputMute') return { inputMuted: false };
      if (request === 'StopRecord') return { outputPath: '/recording.mkv' };
      return {};
    });
    const adapter = new ObsWebsocketAdapter('macos');
    await adapter.startRecord();
    expect(mockCall).toHaveBeenCalledWith('SetInputMute', { inputName: 'Mic/Aux', inputMuted: true });
    await adapter.stopRecord();
    expect(mockCall).toHaveBeenLastCalledWith('SetInputMute', { inputName: 'Mic/Aux', inputMuted: false });
  });

  it('waits for OBS to finalize recording before returning the file for staging', async () => {
    let checks = 0;
    mockCall.mockImplementation(async (request: string) => {
      if (request === 'StopRecord') return { outputPath: '/finished.mkv' };
      if (request === 'GetRecordStatus') return { outputActive: ++checks < 2 };
      return {};
    });
    const output = await new ObsWebsocketAdapter('macos').stopRecord();
    expect(output.outputPath).toBe('/finished.mkv');
    expect(checks).toBe(2);
  });

  it('restores global audio if starting a recording fails', async () => {
    mockCall.mockImplementation(async (request: string) => {
      if (request === 'GetSpecialInputs') return { mic1: 'Mic/Aux' };
      if (request === 'GetInputMute') return { inputMuted: false };
      if (request === 'StartRecord') throw new Error('encoder failed');
      return {};
    });
    await expect(new ObsWebsocketAdapter('macos').startRecord()).rejects.toThrow('encoder failed');
    expect(mockCall).toHaveBeenLastCalledWith('SetInputMute', { inputName: 'Mic/Aux', inputMuted: false });
  });

  it('allows configuration when the replay buffer is disabled', async () => {
    mockCall.mockResolvedValueOnce({ outputActive: false }).mockResolvedValueOnce({ outputActive: false })
      .mockRejectedValueOnce(Object.assign(new Error('Replay buffer is not available.'), { code: 604 }));
    await expect(new ObsWebsocketAdapter('macos').assertIdle()).resolves.toBeUndefined();
  });

  it('refuses reconfiguration while recording', async () => {
    mockCall.mockResolvedValueOnce({ outputActive: true });
    await expect(new ObsWebsocketAdapter('macos').assertIdle()).rejects.toThrow(/OBS/);
  });
});
