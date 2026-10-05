import { describe, it, expect, vi } from 'vitest';
import { MachineConfig, DisplayInfo, RecordingSession, AudioMode, Profile } from '@mt/domain';
import { WorkspaceController } from './workspace-controller';
const session = new RecordingSession('id', 'Work', 0, AudioMode.Meeting, new Date(), '/data/Staging/id/recording.mkv');
function fixture() {
  const storage = { resolveStorageRoot: async () => new MachineConfig('/data', new Date(), undefined, undefined, { defaultProfile: 'Work' }), layout: () => ({ recordings: '/data' }), resolveObsConnection: () => ({}) };
  const obs = { configureScenes: vi.fn().mockResolvedValue([new DisplayInfo(0, 'Dell')]), startRecording: vi.fn(), stopRecording: vi.fn().mockResolvedValue('/data/new.mkv') };
  const recording = { startInputLogging: vi.fn().mockResolvedValue({ handle: { stop: async () => ({ crashed: false }) }, outputPath: '/data/events' }), stopAndStage: vi.fn().mockResolvedValue(session) };
  const library = { list: vi.fn().mockResolvedValue([{ name: 'recording.mkv', path: session.videoPath, directory: false }]), importVideo: vi.fn().mockResolvedValue(session) };
  const runtime = { prepare: vi.fn().mockResolvedValue([]) };
  const processing = { process: vi.fn().mockResolvedValue({ notePath: '/report.md', transcriptPath: '/audio.txt' }) };
  const controller = new WorkspaceController(storage as any, { listAvailableProfiles: async () => [new Profile('Work')] } as any, obs as any, recording as any, library as any, runtime as any, processing as any);
  return { controller, obs, recording, library, runtime, processing };
}
describe('workspace controller', () => {
  it('starts with generic output available and SC registration off', async () => {
    const { controller } = fixture();
    await controller.initialize();
    expect(controller.state.profiles.map(profile => profile.name)).toContain('Sem perfil');
    expect(controller.state.registerSc).toBe(false);
  });
  it('returns to idle after stopping and makes the new recording immediately available for transcription', async () => {
    const { controller, library, processing } = fixture();
    await controller.initialize(); await controller.startRecording();
    expect(controller.state.phase).toBe('recording');
    await controller.stopRecording();
    expect(controller.state.phase).toBe('idle');
    expect(controller.state.selectedPath).toBe(session.videoPath);
    await controller.transcribeSelected();
    expect(library.importVideo).toHaveBeenCalledWith(session.videoPath, '/data', 'Work');
    expect(processing.process).toHaveBeenCalled();
    expect(controller.state.phase).toBe('idle');
    expect(controller.state.result?.transcriptPath).toBe('/audio.txt');
  });
  it('keeps a failed stop retryable and rejects a second start', async () => {
    const { controller, obs } = fixture();
    await controller.initialize(); await controller.startRecording();
    await expect(controller.startRecording()).rejects.toThrow();
    obs.stopRecording.mockRejectedValueOnce(new Error('OBS disconnected'));
    await expect(controller.stopRecording()).rejects.toThrow('OBS disconnected');
    expect(controller.state.phase).toBe('recording');
    await controller.stopRecording(); expect(controller.state.phase).toBe('idle');
  });
  it('keeps recording usable without the optional input logger and restores idle after processing errors', async () => {
    const { controller, recording, runtime } = fixture();
    recording.startInputLogging.mockRejectedValue(new Error('permission'));
    await controller.initialize(); await controller.startRecording(); await controller.stopRecording();
    expect(controller.state.phase).toBe('idle');
    expect(controller.state.messages.join('\n')).toContain('permission');
    runtime.prepare.mockRejectedValue(new Error('Modelo ausente'));
    await expect(controller.transcribeSelected()).rejects.toThrow('Modelo ausente');
    expect(controller.state.phase).toBe('idle');
  });
  it('recovers to idle on archive failure and points to the original recording', async () => {
    const { controller, recording } = fixture();
    recording.stopAndStage.mockRejectedValue(new Error('disco cheio'));
    await controller.initialize(); await controller.startRecording();
    await expect(controller.stopRecording()).rejects.toThrow('disco cheio');
    expect(controller.state.phase).toBe('idle');
    expect(controller.state.selectedPath).toBe('/data/new.mkv');
  });
});
