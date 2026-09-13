// Account profile: everything that makes this pipeline THIS account.
// One JSON per account; OPENSOCIAL_PROFILE selects it (default: oagentico).
// Secrets stay in .env — the profile holds identity, not credentials.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = process.env.OPENSOCIAL_PROFILE ?? join(root, 'profile.oagentico.json');

export const profile = Object.freeze(JSON.parse(readFileSync(path, 'utf8')));
export const API = profile.apiBase;
/** API token: <ID>_TOKEN (e.g. OAGENTICO_TOKEN), or profile.apiTokenEnv. */
export const apiToken = () => {
  const name = profile.apiTokenEnv ?? `${profile.id.toUpperCase()}_TOKEN`;
  return process.env[name] ?? envValue(name);
};
export const BRAND = profile.brand;
export const HANDLE = profile.handle;
/** Per-account state dir: queue, seen sets, candidates never collide. */
export const stateFile = (name) =>
  join(process.env.HOME ?? '', '.config', 'opensocial', profile.id === 'oagentico' ? name : `${profile.id}-${name}`);
