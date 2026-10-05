import { MeetingNote, Transcript } from '@mt/domain';
import { SynthesisContext, Synthesizer } from './synthesizer';

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.2:3b';

const SYSTEM_PROMPT = [
  'Você é um assistente que resume reuniões em português do Brasil.',
  'A partir da transcrição (e da linha do tempo correlacionada, quando houver),',
  'responda SOMENTE com um objeto JSON com as chaves:',
  '"summary" (string, 2-4 frases), "keyPoints" (array de strings),',
  '"decisions" (array), "actions" (array), "risks" (array).',
  'A linha do tempo, quando presente, traz cliques, trocas de janela ativa e',
  'descrições do que estava na tela — use-a para enriquecer os pontos e ações',
  '(ex.: qual tela/documento estava em foco numa decisão), nunca como fonte',
  'principal por si só. Não invente informação que não esteja na transcrição',
  'ou na linha do tempo. Use [] para listas vazias.',
].join(' ');

interface OllamaGenerateResponse {
  response?: string;
}

/**
 * Structured synthesis via a local (or remote) Ollama instance, using
 * `/api/generate` with `format: "json"`. Overridable via env: `MT_OLLAMA_URL`,
 * `MT_OLLAMA_LLM_MODEL`.
 */
export class OllamaSynthesizer implements Synthesizer {
  async synthesize(transcript: Transcript, context: SynthesisContext): Promise<MeetingNote> {
    const baseUrl = (process.env.MT_OLLAMA_URL ?? DEFAULT_URL).replace(/\/$/, '');
    const model = process.env.MT_OLLAMA_LLM_MODEL ?? DEFAULT_MODEL;

    const prompt = [
      SYSTEM_PROMPT,
      '',
      `Perfil: ${context.profileName}`,
      `Data: ${context.recordedAt.toISOString()}`,
      '',
      'Transcrição:',
      transcript.fullText(),
      ...(context.timelineText ? ['', 'Linha do tempo correlacionada:', context.timelineText] : []),
    ].join('\n');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0.2 } }),
      });
    } catch (error) {
      throw new Error(`não foi possível falar com o Ollama em ${baseUrl}: ${(error as Error).message}`);
    }

    if (!res.ok) {
      throw new Error(`Ollama respondeu ${res.status} ${res.statusText} ao sintetizar a nota`);
    }

    const body = (await res.json()) as OllamaGenerateResponse;
    let sections: unknown;
    try {
      sections = JSON.parse(body.response ?? '');
    } catch {
      throw new Error('resposta do Ollama não é um JSON válido');
    }

    return MeetingNote.fromSections(sections as Parameters<typeof MeetingNote.fromSections>[0]);
  }
}
