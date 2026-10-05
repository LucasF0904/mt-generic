import { promises as fs } from 'node:fs';
import { VisionDescriber } from './vision-describer';

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5vl';

const PROMPT = [
  'Descreva em português do Brasil, em 1-2 frases curtas, o que está visível',
  'nesta captura de tela de uma reunião: transcreva qualquer texto legível',
  '(título de janela, slide, código, planilha) e diga o que parece estar',
  'acontecendo. Não invente conteúdo que não esteja realmente visível.',
].join(' ');

interface OllamaGenerateResponse {
  response?: string;
}

/**
 * Frame description via a local (or remote) Ollama vision model. Overridable
 * via env: `MT_OLLAMA_URL`, `MT_OLLAMA_VISION_MODEL`.
 */
export class OllamaVisionDescriber implements VisionDescriber {
  async describe(imagePath: string): Promise<string> {
    const baseUrl = (process.env.MT_OLLAMA_URL ?? DEFAULT_URL).replace(/\/$/, '');
    const model = process.env.MT_OLLAMA_VISION_MODEL ?? DEFAULT_MODEL;
    const imageBase64 = (await fs.readFile(imagePath)).toString('base64');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: PROMPT, images: [imageBase64], stream: false }),
      });
    } catch (error) {
      throw new Error(`não foi possível falar com o Ollama em ${baseUrl}: ${(error as Error).message}`);
    }

    if (!res.ok) {
      throw new Error(`Ollama respondeu ${res.status} ${res.statusText} ao descrever o frame`);
    }

    const body = (await res.json()) as OllamaGenerateResponse;
    return (body.response ?? '').trim();
  }
}
