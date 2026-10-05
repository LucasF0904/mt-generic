import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObsService } from './obs.service';
import { ObsClientAdapter } from './obs-client.adapter';

describe('ObsService', () => {
  let client: ObsClientAdapter;
  let service: ObsService;

  beforeEach(() => {
    client = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      assertIdle: vi.fn().mockResolvedValue(undefined),
      listMonitors: vi.fn(),
      listScenes: vi.fn(),
      createScene: vi.fn().mockResolvedValue(undefined),
      ensureAudioInputs: vi.fn().mockResolvedValue(undefined),
      ensureDisplayCaptureInput: vi.fn().mockResolvedValue(undefined),
      setRecordDirectory: vi.fn().mockResolvedValue(undefined),
      setCurrentProgramScene: vi.fn().mockResolvedValue(undefined),
      startRecord: vi.fn().mockResolvedValue(undefined),
      stopRecord: vi.fn().mockResolvedValue({ outputPath: 'Z:\\MeetingAI\\2026-08-26 14-30-00.mkv' }),
    };
    service = new ObsService(client);
  });

  describe('testConnection', () => {
    it('returns true and disconnects when connect succeeds', async () => {
      const ok = await service.testConnection();
      expect(ok).toBe(true);
      expect(client.connect).toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('returns false when connect throws', async () => {
      vi.mocked(client.connect).mockRejectedValue(new Error('ECONNREFUSED'));
      const ok = await service.testConnection();
      expect(ok).toBe(false);
    });
  });

  describe('configureScenes', () => {
    it('creates a Reuniao and a Reuniao-Mic scene for each monitor found', async () => {
      vi.mocked(client.listMonitors).mockResolvedValue([{ monitorIndex: 0, monitorName: 'Primary', captureId: 'native-primary' }]);
      vi.mocked(client.listScenes).mockResolvedValue([]);

      const displays = await service.configureScenes('Z:\\MeetingAI');

      expect(displays).toHaveLength(1);
      expect(client.createScene).toHaveBeenCalledWith('DISPLAY1-Reuniao');
      expect(client.createScene).toHaveBeenCalledWith('DISPLAY1-Reuniao-Mic');
      expect(client.ensureAudioInputs).toHaveBeenCalledWith('DISPLAY1-Reuniao', false);
      expect(client.ensureAudioInputs).toHaveBeenCalledWith('DISPLAY1-Reuniao-Mic', true);
      expect(client.ensureDisplayCaptureInput).toHaveBeenCalledWith(
        'DISPLAY1-Reuniao',
        'DISPLAY1-Reuniao-Capture',
        { monitorIndex: 0, monitorName: 'Primary', captureId: 'native-primary' },
      );
      expect(client.setRecordDirectory).toHaveBeenCalledWith('Z:\\MeetingAI');
    });

    it('is idempotent: does not recreate scenes that already exist', async () => {
      vi.mocked(client.listMonitors).mockResolvedValue([{ monitorIndex: 0, monitorName: 'Primary', captureId: 'native-primary' }]);
      vi.mocked(client.listScenes).mockResolvedValue(['DISPLAY1-Reuniao', 'DISPLAY1-Reuniao-Mic']);

      await service.configureScenes('Z:\\MeetingAI');

      expect(client.createScene).not.toHaveBeenCalled();
      expect(client.ensureDisplayCaptureInput).toHaveBeenCalledTimes(2);
      expect(client.setRecordDirectory).toHaveBeenCalledWith('Z:\\MeetingAI');
    });

    it('does not report success when no monitors are connected', async () => {
      vi.mocked(client.listMonitors).mockResolvedValue([]);
      await expect(service.configureScenes('/recordings')).rejects.toThrow(/monitor/);
      expect(client.setRecordDirectory).not.toHaveBeenCalled();
    });

    it('does not change scenes while OBS is recording', async () => {
      vi.mocked(client.assertIdle).mockRejectedValue(new Error('OBS ocupado'));
      await expect(service.configureScenes('/recordings')).rejects.toThrow('OBS ocupado');
      expect(client.createScene).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects even when scene creation fails', async () => {
      vi.mocked(client.listMonitors).mockResolvedValue([{ monitorIndex: 0, monitorName: 'Primary', captureId: 'native-primary' }]);
      vi.mocked(client.listScenes).mockResolvedValue([]);
      vi.mocked(client.createScene).mockRejectedValue(new Error('boom'));

      await expect(service.configureScenes('Z:\\MeetingAI')).rejects.toThrow('boom');
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('listMonitors', () => {
    it('connects, maps monitors to DisplayInfo, and disconnects', async () => {
      vi.mocked(client.listMonitors).mockResolvedValue([
        { monitorIndex: 0, monitorName: 'Primary', captureId: 'native-primary' },
        { monitorIndex: 1, monitorName: 'Secondary', captureId: 'native-secondary' },
      ]);

      const displays = await service.listMonitors();

      expect(displays).toHaveLength(2);
      expect(displays[0].monitorIndex).toBe(0);
      expect(displays[1].monitorIndex).toBe(1);
      expect(client.connect).toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('startRecording', () => {
    it('sets the scene and starts recording', async () => {
      await service.startRecording('DISPLAY1-Reuniao');

      expect(client.setCurrentProgramScene).toHaveBeenCalledWith('DISPLAY1-Reuniao');
      expect(client.startRecord).toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects even when starting the recording fails', async () => {
      vi.mocked(client.startRecord).mockRejectedValue(new Error('boom'));

      await expect(service.startRecording('DISPLAY1-Reuniao')).rejects.toThrow('boom');
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('stopRecording', () => {
    it('stops recording and returns the output path', async () => {
      const outputPath = await service.stopRecording();

      expect(client.stopRecord).toHaveBeenCalled();
      expect(outputPath).toBe('Z:\\MeetingAI\\2026-08-26 14-30-00.mkv');
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects even when stopping the recording fails', async () => {
      vi.mocked(client.stopRecord).mockRejectedValue(new Error('boom'));

      await expect(service.stopRecording()).rejects.toThrow('boom');
      expect(client.disconnect).toHaveBeenCalled();
    });
  });
});
