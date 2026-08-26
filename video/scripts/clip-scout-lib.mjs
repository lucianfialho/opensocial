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
          content: `Você avalia se uma notícia tem um VÍDEO ÓBVIO circulando (demonstração, flagrante, corrida de robô, lançamento com footage). Balanço financeiro, nomeação de executivo, acordo: não tem.

MANCHETE (se tiver vídeo) — regras duras: afirmação direta no presente com o fato mais forte, número sempre que houver, máx 10 palavras, nunca "Vídeo mostra/debate". RUIM: "Robô humanoide supera recorde" | BOM: "Um robô acabou de correr mais rápido que Usain Bolt".

CAPTION: 2-3 frases pt-BR, gancho + contexto, sem hashtag.

Responda SÓ JSON:
{"temVideo": true/false, "query": "busca em inglês curta pra achar o vídeo", "headline": "...", "caption": "..."}`,
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
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({chat_id: chat, text, disable_web_page_preview: false}),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false; // notificação nunca pode travar ou derrubar o chamador
  }
}

/** Radar: trending AI/tech videos on X from the last day, regardless of
 *  the site's coverage. Editorial verification shifts to the human. */
export async function searchRadarX() {
  const key = envValue('TAVILY_API_KEY');
  if (!key) return [];
  // pool rotativo: 3 buscas por rodada, escolhidas pela hora — rodadas
  // seguidas no mesmo dia vasculham territórios diferentes
  const POOL = [
    'viral AI video demo',
    'humanoid robot video incredible',
    'new AI tool demo video',
    'robot fails video funny',
    'AI generated video insane',
    'boston dynamics unitree robot video',
    'self driving car video viral',
    'AI agent demo video wild',
    'tech demo video mind blowing',
    'NASA SpaceX rocket launch video',
    'Optimus Figure humanoid robot demo video',
    'drone swarm footage viral',
    'lab experiment video amazing science',
  ];
  const start = new Date().getHours() % POOL.length;
  const queries = [0, 1, 2].map((i) => POOL[(start + i * 3) % POOL.length]);
  const found = new Map();
  for (const q of queries) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${key}`},
        body: JSON.stringify({query: q, include_domains: ['x.com'], max_results: 8, days: 1, topic: 'news'}),
      });
      if (!res.ok) continue;
      for (const r of (await res.json()).results ?? []) {
        if (/\/status\/\d+/.test(r.url)) found.set(r.url, {url: r.url, title: r.title ?? '', source: 'X'});
      }
    } catch {}
  }
  return [...found.values()];
}

/** NASA image & video library: recent public-domain videos with DIRECT mp4
 *  URLs — no bot-check, downloads fine from datacenter IPs (unlike YouTube),
 *  and replication is 100% safe (US public domain). Rotates a topic per hour. */
export async function searchNasaVideos() {
  const TOPICS = ['robot', 'artemis', 'rocket launch', 'rover', 'space station', 'earth observation'];
  const q = TOPICS[new Date().getHours() % TOPICS.length];
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://images-api.nasa.gov/search?media_type=video&year_start=${year}&q=${encodeURIComponent(q)}`,
      {signal: AbortSignal.timeout(20_000)},
    );
    if (!res.ok) return [];
    const items = (await res.json()).collection?.items ?? [];
    // only what NASA published in the last ~3 weeks — the format needs "now"
    const cutoff = Date.now() - 21 * 86400_000;
    const recent = items
      .filter((i) => new Date(i.data?.[0]?.date_created ?? 0).getTime() > cutoff)
      .slice(0, 3);
    const out = [];
    for (const item of recent) {
      try {
        const files = await (await fetch(item.href, {signal: AbortSignal.timeout(20_000)})).json();
        const mp4s = files.filter((f) => /\.mp4$/i.test(f)).map((f) => f.replace(/^http:/, 'https:'));
        // ~mobile/~medium keeps downloads sane; ~orig can be gigabytes
        const url = mp4s.find((f) => /~medium\.mp4$/i.test(f))
          ?? mp4s.find((f) => /~mobile\.mp4$/i.test(f))
          ?? mp4s[0];
        if (!url) continue;
        out.push({
          url: encodeURI(url),
          title: item.data?.[0]?.title ?? 'NASA video',
          source: 'NASA',
        });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
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
        {role: 'system', content: `Você faz triagem de vídeos virais para o @oagentico (notícias de IA/tech, Brasil). Aprova só o que é: sobre IA/robótica/tech, visualmente interessante, e crível (nada com cara de fake/fora de contexto/cringe de marketing).

MANCHETE — regras duras:
- Nunca descreva o vídeo ("Vídeo mostra...", "Vídeo debate..." = PROIBIDO)
- Afirmação direta no presente, com o fato mais forte; número sempre que houver
- Máx 10 palavras. Tensão ou surpresa > neutralidade
- RUIM: "Vídeo debate robôs humanoides domésticos" | BOM: "O robô doméstico chinês já cozinha melhor que você"

CAPTION do post: 2-3 frases pt-BR — gancho forte na primeira, contexto do que se vê, sem hashtag (o sistema adiciona).

Responda SÓ JSON:
{"vale": true/false, "headline": "...", "caption": "...", "motivo": "1 frase"}`},
        {role: 'user', content: JSON.stringify({titulo: title, url})},
      ],
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/g, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
