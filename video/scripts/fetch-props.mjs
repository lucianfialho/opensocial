// Prop batch: pulls CC0 object photos from the Met Museum open-access API
// and runs them through the sticker factory into public/collage/.
// Usage: node scripts/fetch-props.mjs
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {makeSticker} from './sticker-factory.mjs';
import {chatCompletion, parseJsonBlock} from './llm.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'collage');
mkdirSync(OUT, {recursive: true});

const MET = 'https://collectionapi.metmuseum.org/public/collection/v1';
const TERMS = [
  {slug: 'megafone', q: 'megaphone'},
  {slug: 'maquina-escrever', q: 'typewriter'},
  {slug: 'camera', q: 'camera'},
  {slug: 'lupa', q: 'magnifying glass'},
  {slug: 'telefone', q: 'telephone'},
  {slug: 'globo', q: 'terrestrial globe'},
  {slug: 'trofeu', q: 'trophy cup'},
  {slug: 'relogio', q: 'pocket watch'},
  {slug: 'telescopio', q: 'telescope'},
  {slug: 'microfone', q: 'microphone'},
  {slug: 'olho', q: 'eye miniature'},
  {slug: 'robo', q: 'automaton'},
];

async function screenProp(buf, objeto) {
  const small = await sharp(buf).resize(384, 384, {fit: 'inside'}).jpeg({quality: 78}).toBuffer();
  const text = await chatCompletion({
    model: 'google/gemini-2.5-flash-lite',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        {type: 'text', text: `A imagem é uma FOTO de um(a) ${objeto} — objeto único, reconhecível de cara, isolado em fundo liso claro, sem pessoas e sem ser pintura/gravura de cena? Responda SÓ JSON: {"aproveitavel": true/false, "motivo": "1 frase"}`},
        {type: 'image_url', image_url: {url: 'data:image/jpeg;base64,' + small.toString('base64')}},
      ],
    }],
  });
  return parseJsonBlock(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25_000),
      headers: {'user-agent': 'oagentico-social/1.0 (lucian@metricasboss.com.br)'},
    });
    if (res.ok) return res.json();
    if (res.status === 403 || res.status === 429) { await sleep(2500 * (i + 1)); continue; }
    throw new Error(`${res.status}`);
  }
  throw new Error('rate-limited');
};

/** Wikimedia Commons: PD/CC0 photos only — modern objects the Met lacks. */
async function searchCommons(q) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
    + '&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=' + encodeURIComponent(`${q} filetype:bitmap`)
    + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900';
  const data = await get(url);
  const out = [];
  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const lic = info?.extmetadata?.LicenseShortName?.value ?? '';
    if (!/public domain|cc0/i.test(lic)) continue;
    out.push({url: info.thumburl ?? info.url, titulo: page.title, fonte: info.descriptionurl, licenca: lic});
  }
  return out;
}

const manifest = {};
for (const {slug, q} of TERMS) {
  try {
    const search = await get(`${MET}/search?hasImages=true&q=${encodeURIComponent(q)}`);
    let done = false;
    for (const id of (search.objectIDs ?? []).slice(0, 12)) {
      try {
        await sleep(400);
        const obj = await get(`${MET}/objects/${id}`);
        if (!obj.isPublicDomain || !obj.primaryImageSmall) continue;
        const buf = Buffer.from(await (await fetch(obj.primaryImageSmall, {signal: AbortSignal.timeout(30_000)})).arrayBuffer());
        // objects photographed on light ground work; skip dark-ground shots
        const stats = await sharp(buf).grayscale().stats();
        if (stats.channels[0].mean < 150) continue;
        const screen = await screenProp(buf, q);
        if (!screen.aproveitavel) { console.log(`   reprovado met ${id}: ${screen.motivo}`); continue; }
        await makeSticker(buf, join(OUT, `${slug}.png`));
        manifest[slug] = {met: id, titulo: obj.title, fonte: obj.objectURL, licenca: 'CC0 (Met Open Access)'};
        console.log(`ok ${slug}: ${obj.title.slice(0, 60)} (met ${id})`);
        done = true;
        break;
      } catch {}
    }
    if (!done) {
      // Met é arte antiga — objetos modernos vêm da Commons (PD/CC0)
      for (const cand of (await searchCommons(q)).slice(0, 10)) {
        try {
          await sleep(300);
          const buf = Buffer.from(await (await fetch(cand.url, {signal: AbortSignal.timeout(30_000), headers: {'user-agent': 'oagentico-social/1.0'}})).arrayBuffer());
          const stats = await sharp(buf).grayscale().stats();
          if (stats.channels[0].mean < 150) continue;
          const screen = await screenProp(buf, q);
          if (!screen.aproveitavel) { console.log(`   reprovado commons: ${screen.motivo}`); continue; }
          await makeSticker(buf, join(OUT, `${slug}.png`));
          manifest[slug] = {titulo: cand.titulo, fonte: cand.fonte, licenca: cand.licenca + ' (Wikimedia Commons)'};
          console.log(`ok ${slug} (commons): ${cand.titulo.slice(0, 55)}`);
          done = true;
          break;
        } catch {}
      }
    }
    if (!done) console.log(`-- ${slug}: nenhum candidato aproveitável`);
  } catch (err) {
    console.log(`-- ${slug}: busca falhou (${err.message})`);
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${Object.keys(manifest).length}/${TERMS.length} props em public/collage/`);
