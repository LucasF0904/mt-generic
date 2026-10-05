import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { OllamaVisionDescriber } from './ollama-vision.describer';

vi.mock('node:fs', () => ({ promises: { readFile: vi.fn() } }));

const okResponse = (text: string): Response =>
  ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ response: text }) }) as Response;

describe('OllamaVisionDescriber', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(fs.readFile).mockReset().mockResolvedValue(Buffer.from('fake-jpeg-bytes') as never);
    delete process.env.MT_OLLAMA_URL;
    delete process.env.MT_OLLAMA_VISION_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('sends the image as base64 to /api/generate with the default vision model', async () => {
    fetchMock.mockResolvedValue(okResponse('Uma planilha com o roadmap do Q3.'));

    const description = await new OllamaVisionDescriber().describe('/tmp/frame.jpg');

    expect(description).toBe('Uma planilha com o roadmap do Q3.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('qwen2.5vl');
    expect(body.images).toEqual([Buffer.from('fake-jpeg-bytes').toString('base64')]);
    expect(body.stream).toBe(false);
  });

  it('honours MT_OLLAMA_URL and MT_OLLAMA_VISION_MODEL', async () => {
    process.env.MT_OLLAMA_URL = 'http://gpu.box:11434/';
    process.env.MT_OLLAMA_VISION_MODEL = 'llama3.2-vision';
    fetchMock.mockResolvedValue(okResponse('x'));

    await new OllamaVisionDescriber().describe('/tmp/frame.jpg');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://gpu.box:11434/api/generate');
    expect(JSON.parse(init.body).model).toBe('llama3.2-vision');
  });

  it('trims the response text', async () => {
    fetchMock.mockResolvedValue(okResponse('  com espaço em volta  \n'));

    const description = await new OllamaVisionDescriber().describe('/tmp/frame.jpg');

    expect(description).toBe('com espaço em volta');
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' } as Response);

    await expect(new OllamaVisionDescriber().describe('/tmp/frame.jpg')).rejects.toThrow('Ollama respondeu 500');
  });

  it('wraps a transport failure with the target url', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new OllamaVisionDescriber().describe('/tmp/frame.jpg')).rejects.toThrow(
      'não foi possível falar com o Ollama em http://127.0.0.1:11434',
    );
  });
});
