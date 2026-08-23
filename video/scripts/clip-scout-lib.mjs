// Helpers for the clip scout: LLM judgment, YouTube/Tavily search and
// Telegram notification. All keys come from packages/video/.env.
import {execFileSync} from 'node:child_process';
import {envValue} from './tts.mjs';

const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'deepseek/deepseek-v4-flash';

/** LLM: does this event have an obvious video? Returns judgment + query + headline. */
export async function judgeEvent(event, summary) {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${envValue('AI_GATEWAY_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `Você avalia se uma notícia tem um VÍDEO ÓBVIO circulando (demonstração, flagrante, corrida de robô, lançamento com footage). Balanço financeiro, nomeação de executivo, acordo: não tem. Responda SÓ JSON:
{"temVideo": true/false, "query": "busca em inglês curta pra achar o vídeo", "headline": "manchete pt-BR estilo manchete de reel, máx 12 palavras"}`,
        },
        {role: 'user', content: JSON.stringify({titulo: event.title, resumo: summary})},
      ],
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/g, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/** yt-dlp native YouTube search — results are downloadable by construction. */
export function searchYouTube(query, n = 5) {
  try {
    const out = execFileSync(
      'yt-dlp',
      [`ytsearch${n}:${query}`, '--print', '%(id)s\t%(duration)s\t%(view_count)s\t%(title)s', '--no-download'],
      {encoding: 'utf8', timeout: 120_000},
    );
    return out.trim().split('\n').filter(Boolean).map((line) => {
      const [id, duration, views, ...title] = line.split('\t');
      return {
        url: `https://www.youtube.com/watch?v=${id}`,
        duration: Number(duration) || 0,
        views: Number(views) || 0,
        title: title.join(' '),
        source: 'YouTube',
      };
    });
  } catch {
    return [];
  }
}

/** Tavily: X posts and news pages likely carrying the clip. */
export async function searchTavily(query) {
  const key = envValue('TAVILY_API_KEY');
  if (!key) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${key}`},
      body: JSON.stringify({query: `${query} video`, include_domains: ['x.com', 'twitter.com', 'youtube.com'], max_results: 6}),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title,
      views: 0,
      duration: 0,
      source: /youtube/.test(r.url) ? 'YouTube' : 'X',
    }));
  } catch {
    return [];
  }
}

/** Can THIS machine actually download the video? (datacenter IPs get
 *  bot-checked by YouTube; X usually passes) */
export function canDownload(url) {
  try {
    execFileSync('yt-dlp', ['--simulate', '--quiet', '--no-warnings', url], {timeout: 90_000, stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}

/** Telegram notification; silently skips when the bot is not configured. */
export async function notify(text) {
  const token = envValue('TELEGRAM_BOT_TOKEN');
  const chat = envValue('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({chat_id: chat, text, disable_web_page_preview: false}),
  });
  return res.ok;
}

/** Radar: trending AI/tech videos on X from the last day, regardless of
 *  the site's coverage. Editorial verification shifts to the human. */
export async function searchRadarX() {
  const key = envValue('TAVILY_API_KEY');
  if (!key) return [];
  const queries = [
    'viral AI video demo',
    'humanoid robot video incredible',
    'new AI tool demo video',
  ];
  const found = new Map();
  for (const q of queries) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${key}`},
        body: JSON.stringify({query: q, include_domains: ['x.com'], max_results: 5, days: 1, topic: 'news'}),
      });
      if (!res.ok) continue;
      for (const r of (await res.json()).results ?? []) {
        if (/\/status\/\d+/.test(r.url)) found.set(r.url, {url: r.url, title: r.title ?? '', source: 'X'});
      }
    } catch {}
  }
  return [...found.values()];
}

/** LLM screen for a radar find: on-topic, credible, headline-worthy? */
export async function judgeRadarFind(title, url) {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {authorization: `Bearer ${envValue('AI_GATEWAY_API_KEY')}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      model: envValue('OPENSOCIAL_WRITER_MODEL') ?? 'deepseek/deepseek-v4-flash',
      max_tokens: 1024,
      messages: [
        {role: 'system', content: `Você faz triagem de vídeos virais para o @oagentico (notícias de IA/tech, Brasil). Aprova só o que é: sobre IA/robótica/tech, visualmente interessante, e crível (nada com cara de fake/fora de contexto/cringe de marketing). Responda SÓ JSON:
{"vale": true/false, "headline": "manchete pt-BR máx 12 palavras", "motivo": "1 frase"}`},
        {role: 'user', content: JSON.stringify({titulo: title, url})},
      ],
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/g, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
