// Source-article text for the scriptwriters. The event API ships a 3-line
// summary and claim strings — no numbers, no quotes, no context. Tavily
// extract pulls the actual articles (~US$0.01/event) so the writer works
// from primary material, under the rule "no fact outside the sources".
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PER_ARTICLE = 3200;
const MAX_ARTICLES = 3;

/** Markdown from extract → prose paragraphs only: drop images, links,
 *  nav lists, markup residue; keep the longest real paragraphs first. */
function cleanArticle(raw) {
  const paras = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links → text
    .replace(/%[0-9A-F]{2}/gi, '')                 // url-encoded residue
    .split(/\n+/)
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .filter((l) => l.length > 60 && !/^(share|subscribe|follow|advert|cookie|sign up|read more|related)/i.test(l))
    .filter((l) => /[.!?]"?$/.test(l) || l.length > 140); // real sentences
  // keep document order but cap by budget; prefer dropping short lines first
  const kept = [];
  let budget = MAX_PER_ARTICLE;
  for (const para of paras) {
    if (para.length > budget) continue;
    kept.push(para);
    budget -= para.length + 1;
    if (budget < 80) break;
  }
  return kept.join('\n');
}

/** Returns [{fonte, url, texto}] — cached per event; empty on any failure. */
export async function fetchSources(eventId, artigos = []) {
  const key = envValue('TAVILY_API_KEY');
  const urls = artigos.map((a) => a.canonicalUrl).filter(Boolean).slice(0, MAX_ARTICLES);
  if (!key || urls.length === 0) return [];
  mkdirSync(join(root, 'out', 'sources'), {recursive: true});
  const cachePath = join(root, 'out', 'sources', `event-${eventId}.json`);
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'));
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${key}`},
      body: JSON.stringify({urls}),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return [];
    const out = await res.json();
    const byUrl = new Map((out.results ?? []).map((r) => [r.url, r.raw_content ?? '']));
    const sources = artigos
      .filter((a) => byUrl.has(a.canonicalUrl))
      .map((a) => ({
        fonte: a.sourceName ?? 'fonte',
        url: a.canonicalUrl,
        texto: cleanArticle(byUrl.get(a.canonicalUrl)),
      }))
      .filter((s) => s.texto.length > 300);
    writeFileSync(cachePath, JSON.stringify(sources, null, 2));
    return sources;
  } catch {
    return [];
  }
}
