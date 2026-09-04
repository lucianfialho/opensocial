// Syncs pronuncia.json (repo-versioned pt-BR aliases) to the ElevenLabs
// pronunciation dictionary and pins the new version in pronuncia.lock.json,
// which tts.mjs reads. Usage: node scripts/sync-pronuncia.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiKey = envValue('ELEVENLABS_API_KEY');
if (!apiKey) throw new Error('ELEVENLABS_API_KEY ausente');

const DICT_ID = 'OtVajeC5RdDnSY4sMZgk';
const {regras} = JSON.parse(readFileSync(join(root, 'pronuncia.json'), 'utf8'));

// replace-all semantics: remove every existing rule, then add the file's
// rules — the JSON in the repo is the single source of truth
const get = async (url, init) => {
  const res = await fetch(`https://api.elevenlabs.io${url}`, {
    ...init,
    headers: {'xi-api-key': apiKey, 'content-type': 'application/json', ...(init?.headers ?? {})},
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const dict = await get(`/v1/pronunciation-dictionaries/${DICT_ID}/`);
console.log(`dicionário: ${dict.name ?? DICT_ID} (versão atual ${dict.latest_version_id})`);

// download current rules to know what to remove
const plsRes = await fetch(
  `https://api.elevenlabs.io/v1/pronunciation-dictionaries/${DICT_ID}/${dict.latest_version_id}/download`,
  {headers: {'xi-api-key': apiKey}},
);
const existing = [];
if (plsRes.ok) {
  const pls = await plsRes.text();
  for (const m of pls.matchAll(/<grapheme>([^<]+)<\/grapheme>/g)) existing.push(m[1]);
}
if (existing.length) {
  await get(`/v1/pronunciation-dictionaries/${DICT_ID}/remove-rules`, {
    method: 'POST',
    body: JSON.stringify({rule_strings: existing}),
  });
  console.log(`removidas ${existing.length} regras antigas`);
}

const out = await get(`/v1/pronunciation-dictionaries/${DICT_ID}/add-rules`, {
  method: 'POST',
  body: JSON.stringify({
    rules: Object.entries(regras).map(([string_to_replace, alias]) => ({
      type: 'alias', string_to_replace, alias,
    })),
  }),
});
writeFileSync(
  join(root, 'pronuncia.lock.json'),
  JSON.stringify({pronunciation_dictionary_id: DICT_ID, version_id: out.version_id}, null, 2),
);
console.log(`${Object.keys(regras).length} regras sincronizadas — versão ${out.version_id} pinada no lock`);
