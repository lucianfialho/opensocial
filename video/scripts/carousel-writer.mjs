// LLM carousel scriptwriter: turns an event's synthesis (title + summary +
// claims) into a magazine-style card script. Cached per event; caller falls
// back to the mechanical builder when no ANTHROPIC_API_KEY is configured.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'claude-sonnet-5';

const PROMPT = `Você é o editor de social do "o agêntico", veículo brasileiro de notícias de IA e tech. Converta a síntese de uma notícia em um roteiro de carrossel de Instagram no estilo revista (capa forte, storytelling no miolo, punchline).

Regras:
- 4 a 6 cards no miolo (além de capa e CTA, que são automáticos)
- Capa: reescreva o título como gancho curto (pergunta ou afirmação de impacto, máx 9 palavras) + um subtítulo de 1 frase
- Todo texto em pt-BR, frases curtas, ritmo de fala; zero jargão corporativo
- Em cada card, "accent" é um trecho EXATO (copiado letra a letra) do headline daquele card
- Estilos de card do miolo: "photo" (frase forte, vai sobre foto), "essay" (headline + 2-3 parágrafos curtos + closer em negrito), "cream" (respiro: parágrafo de contexto + afirmação forte)
- Use "essay" para o desenvolvimento (o porquê importa), "photo" para fatos de impacto, "cream" no máximo 1x
- Nunca invente fato que não esteja na síntese; números sempre preservados
- caption: legenda completa do post (gancho + resumo em 2-3 linhas + "Apuração: N veículos independentes." + CTA "Siga @oagentico" + 4 hashtags)

Responda SÓ com JSON válido:
{"cover": {"headline": "...", "accent": "...", "subtitle": "..."},
 "cards": [{"style": "photo|essay|cream", "kicker": "...", "headline": "...", "accent": "...", "paragraphs": ["..."], "closer": "...", "intro": "..."}],
 "caption": "..."}`;

export async function writeCarouselScript(story, detail) {
  const apiKey = envValue('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  mkdirSync(join(root, 'out', 'carousel'), {recursive: true});
  const cachePath = join(root, 'out', 'carousel', `news-${story.id}.script.json`);
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));

  const synthesis = {
    titulo: story.title,
    resumo: detail.summary,
    fatos: (detail.claims ?? []).map((c) => c.texto),
    veiculosIndependentes: story.independentSources,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: PROMPT,
      messages: [{role: 'user', content: JSON.stringify(synthesis)}],
    }),
  });
  if (!res.ok) {
    console.error(`writer: Anthropic ${res.status} — caindo no builder mecânico`);
    return null;
  }
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  try {
    const script = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!script.cover?.headline || !Array.isArray(script.cards) || script.cards.length === 0) {
      throw new Error('script incompleto');
    }
    writeFileSync(cachePath, JSON.stringify(script, null, 2));
    console.log(`writer: roteiro de ${script.cards.length + 2} cards (${MODEL})`);
    return script;
  } catch (err) {
    console.error(`writer: resposta inválida (${err.message}) — caindo no builder mecânico`);
    return null;
  }
}
