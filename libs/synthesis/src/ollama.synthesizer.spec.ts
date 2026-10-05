import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Transcript, TranscriptSegment } from '@mt/domain';
import { OllamaSynthesizer } from './ollama.synthesizer';

const context = { profileName: 'equipe', recordedAt: new Date('2026-09-03T20:00:00.000Z') };
const transcript = new Transcript('pt', [
  new TranscriptSegment(0, 3, 'decidimos migrar para o Postgres'),
  new TranscriptSegment(3, 6, 'a Ana fica responsável pela migração'),
]);

const okResponse = (payload: unknown): Response =>
  ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ response: JSON.stringify(payload) }) }) as Response;

describe('OllamaSynthesizer', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.MT_OLLAMA_URL;
    delete process.env.MT_OLLAMA_LLM_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('POSTs the transcript to /api/generate as a non-streaming JSON request', async () => {
    fetchMock.mockResolvedValue(okResponse({ summary: 's', keyPoints: [], decisions: [], actions: [], risks: [] }));

    await new OllamaSynthesizer().synthesize(transcript, context);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'llama3.2:3b', stream: false, format: 'json' });
    expect(body.prompt).toContain('decidimos migrar para o Postgres');
    expect(body.prompt).toContain('a Ana fica responsável pela migração');
  });

  it('appends the timeline text to the prompt when given', async () => {
    fetchMock.mockResolvedValue(okResponse({ summary: 's', keyPoints: [], decisions: [], actions: [], risks: [] }));

    await new OllamaSynthesizer().synthesize(transcript, {
      ...context,
      timelineText: '[00:01] tela: slide com o roadmap do Q3',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toContain('Linha do tempo correlacionada:');
    expect(body.prompt).toContain('[00:01] tela: slide com o roadmap do Q3');
  });

  it('omits the timeline section entirely when no timeline text is given', async () => {
    fetchMock.mockResolvedValue(okResponse({ summary: 's', keyPoints: [], decisions: [], actions: [], risks: [] }));

    await new OllamaSynthesizer().synthesize(transcript, context);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).not.toContain('Linha do tempo correlacionada');
  });

  it('honours MT_OLLAMA_URL (trailing slash trimmed) and MT_OLLAMA_LLM_MODEL', async () => {
    process.env.MT_OLLAMA_URL = 'http://gpu.box:11434/';
    process.env.MT_OLLAMA_LLM_MODEL = 'qwen2.5:7b';
    fetchMock.mockResolvedValue(okResponse({ summary: 's', keyPoints: [], decisions: [], actions: [], risks: [] }));

    await new OllamaSynthesizer().synthesize(transcript, context);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://gpu.box:11434/api/generate');
    expect(JSON.parse(init.body).model).toBe('qwen2.5:7b');
  });

  it('parses the JSON string in the response into a MeetingNote', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        summary: 'Reunião sobre banco de dados.',
        keyPoints: ['avaliação de custo'],
        decisions: ['migrar para Postgres'],
        actions: ['Ana conduz a migração'],
        risks: ['janela de downtime'],
      }),
    );

    const note = await new OllamaSynthesizer().synthesize(transcript, context);

    expect(note.summary).toBe('Reunião sobre banco de dados.');
    expect(note.decisions).toEqual(['migrar para Postgres']);
    expect(note.risks).toEqual(['janela de downtime']);
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' } as Response);

    await expect(new OllamaSynthesizer().synthesize(transcript, context)).rejects.toThrow('Ollama respondeu 500');
  });

  it('throws when the model output is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ response: 'desculpe, não consegui' }),
    } as Response);

    await expect(new OllamaSynthesizer().synthesize(transcript, context)).rejects.toThrow('não é um JSON válido');
  });

  it('wraps a transport failure with the target url', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new OllamaSynthesizer().synthesize(transcript, context)).rejects.toThrow(
      'não foi possível falar com o Ollama em http://127.0.0.1:11434',
    );
  });
});
