import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { WhisperCppAdapter } from './whisper-cpp.adapter';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { readFile: vi.fn() } }));

const WHISPER_JSON = JSON.stringify({
  result: { language: 'pt' },
  transcription: [
    { offsets: { from: 0, to: 2500 }, text: ' Bom dia a todos' },
    { offsets: { from: 2500, to: 6000 }, text: ' vamos começar' },
  ],
});

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

describe('WhisperCppAdapter', () => {
  const originalEnv = { ...process.env };
  let child: FakeChild;

  beforeEach(() => {
    child = new FakeChild();
    vi.mocked(spawn).mockReset().mockReturnValue(child as never);
    vi.mocked(fs.readFile).mockReset().mockResolvedValue(WHISPER_JSON as never);
    delete process.env.MT_WHISPER_LANG;
    delete process.env.MT_WHISPER_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const succeed = () => child.emit('exit', 0, null);

  it('spawns the platform binary with the model under storageRoot/bin and JSON output', async () => {
    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    succeed();
    await promise;

    expect(spawn).toHaveBeenCalledWith(
      path.join('/srv', 'bin', 'whisper-cli'),
      [
        '-m',
        path.join('/srv', 'bin', 'models', 'ggml-medium.bin'),
        '-f',
        '/srv/S/audio.wav',
        '-l',
        'pt',
        '-oj',
        '-of',
        '/srv/S/audio',
      ],
    );
  });

  it('uses whisper-cli.exe on Windows', async () => {
    const promise = new WhisperCppAdapter('windows').transcribe('Z:\\S\\audio.wav', 'Z:\\MeetingAI');
    succeed();
    await promise;

    const [binary] = vi.mocked(spawn).mock.calls[0];
    expect(binary).toBe(path.join('Z:\\MeetingAI', 'bin', 'whisper-cli.exe'));
  });

  it('honours MT_WHISPER_LANG and MT_WHISPER_MODEL', async () => {
    process.env.MT_WHISPER_LANG = 'en';
    process.env.MT_WHISPER_MODEL = 'ggml-large-v3.bin';

    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    succeed();
    await promise;

    const [, args] = vi.mocked(spawn).mock.calls[0] as unknown as [string, string[]];
    expect(args).toContain('en');
    expect(args).toContain(path.join('/srv', 'bin', 'models', 'ggml-large-v3.bin'));
  });

  it('maps millisecond offsets from the JSON sidecar into second-based segments', async () => {
    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    succeed();
    const transcript = await promise;

    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith('/srv/S/audio.json', 'utf-8');
    expect(transcript.language).toBe('pt');
    expect(transcript.segments).toEqual([
      { startSeconds: 0, endSeconds: 2.5, text: 'Bom dia a todos' },
      { startSeconds: 2.5, endSeconds: 6, text: 'vamos começar' },
    ]);
    expect(transcript.fullText()).toBe('Bom dia a todos vamos começar');
  });

  it('rejects with stderr when the CLI exits non-zero', async () => {
    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    child.stderr.emit('data', Buffer.from('failed to load model'));
    child.emit('exit', 1, null);

    await expect(promise).rejects.toThrow('failed to load model');
  });

  it('rejects when the CLI dies from a signal, using the exit code as a fallback message', async () => {
    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    child.emit('exit', null, 'SIGKILL');

    await expect(promise).rejects.toThrow('whisper.cpp falhou na transcrição');
  });

  it('rejects when the binary itself fails to spawn', async () => {
    const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');
    child.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });

  describe('onProgress', () => {
    it('reports 0-100 by combining the duration line with each segment end timestamp', async () => {
      const onProgress = vi.fn();
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv', onProgress);

      child.stdout.emit('data', Buffer.from("main: processing 'audio.wav' (249151 samples, 20.0 sec), 4 threads\n"));
      child.stdout.emit('data', Buffer.from('[00:00:00.000 --> 00:00:05.000]  primeiro trecho\n'));
      child.stdout.emit('data', Buffer.from('[00:00:05.000 --> 00:00:20.000]  segundo trecho\n'));
      succeed();
      await promise;

      expect(onProgress).toHaveBeenCalledWith(25);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('does not call onProgress before any duration line has been seen at all', async () => {
      const onProgress = vi.fn();
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv', onProgress);

      child.stdout.emit('data', Buffer.from('[00:00:00.000 --> 00:00:05.000]  sem duração ainda\n'));
      succeed();
      await promise;

      expect(onProgress).not.toHaveBeenCalled();
    });

    // Regression test: an earlier implementation used `totalSeconds ??= Number(match?.[1])`,
    // which — the very first time watch() ran on a chunk with no duration
    // line (whisper.cpp's real startup log emits several init lines before
    // the "(N samples, M sec)" one) — assigned NaN and, being non-nullish,
    // permanently locked out any real duration found in a later chunk. This
    // silently broke 100% of real transcriptions (verified for real on
    // macOS); every previous test here happened to put the duration line in
    // the very first chunk, so none of them caught it.
    it('still finds the duration once it arrives, even after earlier non-matching chunks', async () => {
      const onProgress = vi.fn();
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv', onProgress);

      child.stderr.emit('data', Buffer.from("whisper_init_from_file_with_params_no_state: loading model...\n"));
      child.stderr.emit('data', Buffer.from('whisper_model_load: n_vocab = 51865\n'));
      child.stderr.emit(
        'data',
        Buffer.from("main: processing 'audio.wav' (58116 samples, 10.0 sec), 4 threads\n"),
      );
      child.stdout.emit('data', Buffer.from('[00:00:00.000 --> 00:00:05.000]  metade\n'));
      succeed();
      await promise;

      expect(onProgress).toHaveBeenCalledWith(50);
    });

    it('copes with the duration line itself arriving split across two chunks', async () => {
      const onProgress = vi.fn();
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv', onProgress);

      child.stderr.emit('data', Buffer.from("main: processing 'audio.wav' (58116 samples, 10."));
      child.stderr.emit('data', Buffer.from('0 sec), 4 threads\n'));
      child.stdout.emit('data', Buffer.from('[00:00:00.000 --> 00:00:10.000]  tudo\n'));
      succeed();
      await promise;

      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('does not re-emit the same percentage twice in a row', async () => {
      const onProgress = vi.fn();
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv', onProgress);

      // Duration + segment in one chunk so only a single 50% comes out of it.
      child.stderr.emit(
        'data',
        Buffer.from(
          "main: processing 'audio.wav' (58116 samples, 10.0 sec), 4 threads\n[00:00:00.000 --> 00:00:05.000]  primeiro\n",
        ),
      );
      // An unrelated stray chunk (e.g. a timing log line) adds no new segment,
      // so the recomputed percentage is still 50% — must not fire again.
      child.stderr.emit('data', Buffer.from('whisper_print_timings:     mel time =     4.47 ms\n'));
      succeed();
      await promise;

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(50);
    });

    it('never touches onProgress when it is not given', async () => {
      const promise = new WhisperCppAdapter('macos').transcribe('/srv/S/audio.wav', '/srv');

      child.stdout.emit('data', Buffer.from("(249151 samples, 20.0 sec)\n[00:00:00.000 --> 00:00:05.000]  x\n"));
      succeed();

      await expect(promise).resolves.toBeDefined();
    });
  });
});
