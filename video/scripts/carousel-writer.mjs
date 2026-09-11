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
import {fetchSources} from './sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'anthropic/claude-sonnet-5';

const PROMPT = `Você é o editor de social do "o agêntico", veículo brasileiro de notícias de IA e tech. Converta a síntese de uma notícia em um roteiro de carrossel de Instagram no estilo revista. O carrossel é uma HISTÓRIA que o leitor desliza — não uma lista de fatos.

MATÉRIA-PRIMA: o input traz "fontes" — o texto das matérias originais. Números exatos, citações, nomes e contexto vêm DALI; a síntese é só o mapa. Regra dura: nenhum fato fora da síntese ou das fontes.

AS 4 LEIS DO ROTEIRO:
1. ARCO (estrutura PAS): a capa abre com TENSÃO — o fato mais surpreendente, o número que choca ou a pergunta que incomoda. NUNCA o título da notícia reescrito. Os cards seguintes agitam (por que isso mexe com a vida de quem lê), desenvolvem (o que aconteceu de fato) e fecham com punchline (a consequência ou a pergunta que fica). Antes de escrever, identifique: qual é O fato da história? Ele lidera a capa.
2. NADA DE LINGUIÇA: cada card acrescenta informação NOVA. Proibido repetir o fato da capa ou de outro card com outras palavras. Se a síntese sustenta só 3 cards fortes, escreva 3 — card fraco mata a retenção do carrossel inteiro.
3. HISTÓRIA: conecte os fatos em narrativa — causa, consequência, o que muda pra quem lê. Fato solto sem contexto ("Fulano e os 2.275%") é proibido: todo número vem amarrado ao que ele significa.
4. EMOÇÃO: escolha a emoção dominante da notícia (surpresa, indignação, esperança, humor, alívio) e escreva o roteiro INTEIRO nela. Texto morno de assessoria é proibido — clichês banidos: "o futuro está em jogo", "legado inegável", "momento crucial", "marco histórico", "divisor de águas".

FORMATO:
- 3 a 6 cards no miolo (além de capa e CTA, que são automáticos)
- Capa: gancho de impacto (máx 9 palavras) + subtítulo de 1 frase
- Todo texto em pt-BR, frases curtas, ritmo de fala; zero jargão corporativo
- Em cada card, "accent" é um trecho EXATO (copiado letra a letra) do headline daquele card, com NO MÁXIMO 4 palavras — nunca o headline inteiro
- Estilos de card do miolo: "photo" (frase forte, vai sobre foto), "essay" (headline + 2-3 parágrafos curtos + closer em negrito), "cream" (respiro: parágrafo de contexto + afirmação forte)
- Use "essay" para o desenvolvimento (o porquê importa), "photo" para fatos de impacto, "cream" no máximo 1x
- Se houver "imagens" no input: cada card "photo" DEVE indicar "imageIndex" (o índice da imagem escolhida). REGRA DURA: imagem com pessoa_identificavel=true só pode ilustrar card cujo texto cite essa pessoa pelo nome; nunca associe o rosto de alguém a fato que não é sobre essa pessoa. Sem imagem pertinente e segura? Use "essay" ou "cream". Nunca repita imageIndex
- PÔSTER DE COLAGEM: a capa SEMPRE traz "poster": {"cena": "3-5 peças recortadas descritas em inglês, objetos/figuras concretos da notícia (ex.: 'a halftone cutout of a scientist in a lab coat, a red virus illustration, a torn newspaper strip'), SEM texto na cena, SEM logos de empresas reais", "bg": "cream|ink|yellow"}. Cards "photo" podem trazer "poster" no lugar de "imageIndex" quando não houver imagem real pertinente e segura — pôster gerado é sempre melhor que foto errada.
- Nunca invente fato que não esteja na síntese; números sempre preservados
- caption: legenda completa do post (gancho + resumo em 2-3 linhas + "Apuração: N veículos independentes." + CTA "Siga @oagentico" + 4 hashtags)

Responda SÓ com JSON válido:
{"cover": {"headline": "...", "accent": "...", "subtitle": "...", "poster": {"cena": "...", "bg": "..."}},
 "cards": [{"style": "photo|essay|cream", "kicker": "...", "headline": "...", "accent": "...", "paragraphs": ["..."], "closer": "...", "intro": "...", "imageIndex": 0, "poster": {"cena": "...", "bg": "..."}}],
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
  const fontes = await fetchSources(story.id, detail.artigos ?? []);
  console.log(`fontes: ${fontes.length} artigo(s) extraído(s)`);
  const synthesis = {
    titulo: story.title,
    resumo: detail.summary,
    fatos: (detail.claims ?? []).map((c) => c.texto),
    fontes: fontes.map((f) => ({veiculo: f.fonte, texto: f.texto})),
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
    for (const [i, card] of script.cards.entries()) {
      if (typeof card.headline !== 'string' || !card.headline.trim()) {
        throw new Error(`card ${i} sem headline`);
      }
      if (card.accent && !card.headline.includes(card.accent)) {
        throw new Error(`card ${i}: accent não é trecho do headline`);
      }
    }
    if (script.cover.accent && !script.cover.headline.includes(script.cover.accent)) {
      throw new Error('capa: accent não é trecho do headline');
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
