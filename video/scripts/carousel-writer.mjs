// LLM carousel scriptwriter: turns an event's synthesis (title + summary +
// claims) into a magazine-style card script via the Vercel AI Gateway.
// Cached per event; caller falls back to the mechanical builder when no
// AI_GATEWAY_API_KEY is configured.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';
import {checkCopy} from './copy-check.mjs';
import {chatCompletion, llmKey, parseJsonBlock} from './llm.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'anthropic/claude-sonnet-5';

const PROMPT = `Você é o editor de social do "o agêntico", veículo brasileiro de notícias de IA e tech. Converta a síntese de uma notícia em um roteiro de carrossel de Instagram no estilo revista (capa forte, storytelling no miolo, punchline).

Regras:
- 4 a 6 cards no miolo (além de capa e CTA, que são automáticos)
- Capa: reescreva o título como gancho curto (pergunta ou afirmação de impacto, máx 9 palavras) + um subtítulo de 1 frase
- Todo texto em pt-BR, frases curtas, ritmo de fala; zero jargão corporativo
- Em cada card, "accent" é um trecho EXATO (copiado letra a letra) do headline daquele card, com NO MÁXIMO 4 palavras — nunca o headline inteiro
- Estilos de card do miolo: "photo" (frase forte, vai sobre foto), "essay" (headline + 2-3 parágrafos curtos + closer em negrito), "cream" (respiro: parágrafo de contexto + afirmação forte)
- Use "essay" para o desenvolvimento (o porquê importa), "photo" para fatos de impacto, "cream" no máximo 1x
- Se houver "imagens" no input: cada card "photo" DEVE indicar "imageIndex" (o índice da imagem escolhida). REGRA DURA: imagem com pessoa_identificavel=true só pode ilustrar card cujo texto cite essa pessoa pelo nome; nunca associe o rosto de alguém a fato que não é sobre essa pessoa. Sem imagem pertinente e segura? Use "essay" ou "cream". Nunca repita imageIndex
- Nunca invente fato que não esteja na síntese; números sempre preservados
- caption: legenda completa do post (gancho + resumo em 2-3 linhas + "Apuração: N veículos independentes." + CTA "Siga @oagentico" + 4 hashtags)

Responda SÓ com JSON válido:
{"cover": {"headline": "...", "accent": "...", "subtitle": "..."},
 "cards": [{"style": "photo|essay|cream", "kicker": "...", "headline": "...", "accent": "...", "paragraphs": ["..."], "closer": "...", "intro": "..."}],
 "caption": "..."}`;

export async function writeCarouselScript(story, detail, images = []) {
  mkdirSync(join(root, 'out', 'carousel'), {recursive: true});
  const cachePath = join(root, 'out', 'carousel', `news-${story.id}.script.json`);
  // a ready script needs no API key — cache first
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));

  const apiKey = llmKey();
  if (!apiKey) return null;

  let imagens = [];
  if (images.length > 0) {
    const {describeImages} = await import('./image-vision.mjs');
    imagens = await describeImages(images, apiKey);
    console.log(`vision: ${imagens.length} imagens analisadas (${imagens.filter((i) => i.pessoa_identificavel).length} com pessoa identificável)`);
  }
  const synthesis = {
    titulo: story.title,
    resumo: detail.summary,
    fatos: (detail.claims ?? []).map((c) => c.texto),
    veiculosIndependentes: story.independentSources,
    imagens,
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const text = await chatCompletion({
      model: MODEL,
      max_tokens: 8192,
      messages: [
        {role: 'system', content: PROMPT},
        {role: 'user', content: JSON.stringify(synthesis)},
      ],
    }, apiKey);
    const script = parseJsonBlock(text);
    if (!script.cover?.headline || !Array.isArray(script.cards) || script.cards.length === 0) {
      throw new Error('script incompleto');
    }
    const gate = checkCopy({headline: script.cover.headline, caption: script.caption});
    if (!gate.ok) throw new Error(`trava de qualidade: ${gate.motivo}`);
    writeFileSync(cachePath, JSON.stringify(script, null, 2));
    console.log(`writer: roteiro de ${script.cards.length + 2} cards (${MODEL})`);
    return script;
  } catch (err) {
    console.error(`writer: resposta inválida (${err.message}) — tentativa ${attempt}`);
  }
  }
  console.error('writer: sem roteiro válido — caindo no builder mecânico');
  return null;
}
