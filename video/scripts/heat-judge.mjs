// Editorial heat judge: scores an event 0-10 on the "Discord criterion"
// the reach autopsies converged on — human stakes + heat of the moment.
// With a 4/day cap, a slot in the queue is earned, not granted.
import {envValue} from './tts.mjs';
import {chatCompletion, parseJsonBlock} from './llm.mjs';

const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'deepseek/deepseek-v4-flash';

const PROMPT = `Você é o editor-chefe do @oagentico (Instagram de notícias de IA/tech, Brasil). A conta publica NO MÁXIMO 4 posts/dia — cada vaga é disputada. Dê uma nota de calor 0-10 pra notícia.

NOTA ALTA (7-10) — peso humano + calor do momento:
- Afeta pessoas diretamente: emprego, privacidade, dinheiro, governo, escola (ex.: ANPD suspende reconhecimento facial em escolas)
- Está acontecendo AGORA e as pessoas estão falando disso; tem imagem mental forte ou número que choca
- Conflito, flagrante, recorde, virada — não comunicado

NOTA BAIXA (0-4) — frio:
- Balanço/resultado financeiro, nomeação de executivo, acordo B2B, parceria corporativa
- Release de produto incremental (versão x.1, novo modelo de relógio)
- Regulatório distante do Brasil sem efeito concreto em pessoas

5-6 = morno: relevante pro nicho mas sem urgência nem peso humano.

Responda SÓ JSON:
{"nota": 0-10, "motivo": "1 frase direta"}`;

export async function judgeHeat(event, summary) {
  const text = await chatCompletion({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {role: 'system', content: PROMPT},
      {
        role: 'user',
        content: JSON.stringify({
          titulo: event.title,
          resumo: summary,
          veiculosIndependentes: event.independentSources,
        }),
      },
    ],
  });
  const out = parseJsonBlock(text);
  if (typeof out.nota !== 'number') throw new Error('resposta sem nota');
  return out;
}
