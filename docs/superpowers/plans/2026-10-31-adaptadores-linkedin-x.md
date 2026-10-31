# Adaptadores de LinkedIn e X — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `opensocial connect linkedin`, `opensocial connect x` e `opensocial post --to linkedin,x --text ... --media card.jpg` funcionam, publicando texto + no máximo uma imagem, com OAuth (PKCE no X), refresh de token e os mesmos erros tipados dos adaptadores existentes.

**Architecture:** Dois adaptadores novos em `packages/core/src/adapters/` seguindo o contrato `PlatformAdapter`; o contrato ganha `pkce?: boolean` e parâmetros opcionais `extra` em `authorizeUrl`/`exchangeCode`; o comando `connect` é refatorado numa função com dependências injetáveis pra ser testável e gera o par PKCE quando o adaptador pede. Upload de imagem é bytes diretos (`mediaIngestion: direct-upload`), sem media host. Tudo o mais (validação prévia, refresh em 401, 429, `accounts.json`) é o fluxo existente de `publish.ts`.

**Tech Stack:** TypeScript (ESM, `tsc`), pnpm workspaces, vitest 2, Node ≥ 20 (`fetch`, `FormData`, `Blob`, `crypto` nativos).

**Spec:** `docs/superpowers/specs/2026-10-31-adaptadores-linkedin-x-design.md`

## Global Constraints

- Texto + no máximo 1 imagem por post nas duas redes; vídeo é rejeitado em `validate` com a mensagem contendo "vídeo não suportado nesta versão".
- LinkedIn: escopo `openid profile w_member_social`; headers `LinkedIn-Version: 202601` e `X-Restli-Protocol-Version: 2.0.0` em toda chamada `api.linkedin.com/rest/*`; `author` = `urn:li:person:<account.id>`; texto ≤ 3000; `commentary` passa por `escapeLinkedInLittleText`.
- X: PKCE S256 obrigatório; escopos `tweet.read tweet.write users.read offline.access`; token endpoint com `Authorization: Basic base64(clientId:clientSecret)`; refresh token é de uso único (a conta devolvida carrega o novo); texto ≤ 280 ponderado (URL conta 23); upload `POST https://api.x.com/2/media/upload` multipart com `media_category=tweet_image`.
- Erros: não-2xx → `ApiError("<Rede> <contexto> failed (<status>): <corpo até 300 chars>", status)`; 429 do X → `RateLimitError` com `retryAfterSeconds` de `x-rate-limit-reset` quando presente; refresh impossível → `AuthExpiredError` com instrução `opensocial connect <p>`.
- Redirect de OAuth continua `http://localhost:8976/callback` (`REDIRECT_URI`); `NEEDS_TLS` é `false` pros dois.
- Instagram, TikTok e YouTube não mudam de comportamento: os parâmetros novos do contrato são opcionais e eles não os leem.
- Commits direto no `main` com `git add <paths>` + `git commit <paths>`, nunca `-a`/`.`; mensagens em inglês no estilo do repo (`feat(core): ...`, `feat(cli): ...`, `docs: ...`); cada commit termina com:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013NwxSuZYAXVtcGmt1nupYS
  ```
- Antes de cada commit: `pnpm -r build` sem erro e `pnpm test` (vitest, raiz) verde.
- Testes nunca tocam a rede: todo adaptador recebe `fetchImpl` injetado (`sequenceFetch` de `test-helpers.ts`).

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `packages/core/src/oauth.ts` | `pkcePair()` (verifier + challenge S256) | 1 |
| `packages/core/src/oauth.test.ts` | testa `pkcePair` com vetor do RFC 7636 | 1 |
| `packages/core/src/adapter.ts` | `pkce?`, `AuthorizeExtra`, `ExchangeExtra` no contrato | 1 |
| `packages/cli/src/commands/connect.ts` | `connectWith(platform, deps)` + `connectCommand` fino | 1 |
| `packages/cli/src/commands/connect.test.ts` | PKCE passado só quando `adapter.pkce` | 1 |
| `packages/core/src/test-helpers.ts` | `rawResponse(body, status, headers)` | 2 |
| `packages/core/src/adapters/linkedin.ts` | adaptador LinkedIn | 2 |
| `packages/core/src/adapters/linkedin.test.ts` | testes do LinkedIn | 2 |
| `packages/core/src/types.ts`, `adapter.ts`, `config.ts`, `cli/.../connect.ts` | `'linkedin'` na união/registro/config/`NEEDS_TLS` | 2 |
| `packages/core/src/adapters/x.ts` | adaptador X | 3 |
| `packages/core/src/adapters/x.test.ts` | testes do X | 3 |
| `packages/core/src/types.ts`, `adapter.ts`, `config.ts`, `cli/.../connect.ts` | `'x'` na união/registro/config/`NEEDS_TLS` | 3 |
| `packages/cli/src/index.ts`, `README.md`, `docs/setup-linkedin.md`, `docs/setup-x.md` | ajuda do `--to`, tabela, guias de setup | 4 |

---

### Task 1: PKCE no contrato e no `connect`

**Files:**
- Modify: `packages/core/src/oauth.ts` (acrescentar no fim)
- Create: `packages/core/src/oauth.test.ts`
- Modify: `packages/core/src/adapter.ts` (interface `PlatformAdapter`)
- Modify: `packages/cli/src/commands/connect.ts` (reescrever)
- Create: `packages/cli/src/commands/connect.test.ts`

**Interfaces:**
- Produces: `pkcePair(): { verifier: string; challenge: string }` em `@opensocial/core`.
- Produces: no contrato, `pkce?: boolean`; `authorizeUrl(creds, redirectUri, state, extra?: AuthorizeExtra)` com `AuthorizeExtra = { codeChallenge?: string }`; `exchangeCode(creds, code, redirectUri, fetchImpl?, extra?: ExchangeExtra)` com `ExchangeExtra = { codeVerifier?: string }`.
- Produces: `connectWith(platform: string, deps: ConnectDeps): Promise<Account>` e `ConnectDeps = { adapters, getCreds, waitForCallback, open, saveAccount, log, redirectUri? }` em `connect.ts`. Tasks 2 e 3 só precisam saber que `connect` chama `authorizeUrl`/`exchangeCode` com `extra` quando `pkce` é verdadeiro.

- [ ] **Step 1: Teste de `pkcePair` (falha)**

Criar `packages/core/src/oauth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { pkcePair, pkceChallenge } from './oauth.js'

describe('pkce', () => {
  it('challenge is base64url(sha256(verifier)) — RFC 7636 appendix B vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('pkcePair generates a 43-char base64url verifier and a matching challenge', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })
  it('two pairs differ', () => {
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run packages/core/src/oauth.test.ts`
Expected: FAIL — `pkcePair`/`pkceChallenge` não exportados.

- [ ] **Step 3: Implementar em `oauth.ts`**

Acrescentar no fim de `packages/core/src/oauth.ts` (o arquivo já importa `randomBytes` de `node:crypto`; acrescentar `createHash` ao mesmo import):

```ts
/** PKCE (RFC 7636): verifier = 32 random bytes as base64url (43 chars),
 *  challenge = base64url(sha256(verifier)). X requires it; the other
 *  platforms ignore it. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: pkceChallenge(verifier) }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm vitest run packages/core/src/oauth.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Estender o contrato em `adapter.ts`**

Substituir a interface `PlatformAdapter` por:

```ts
export interface AuthorizeExtra { codeChallenge?: string }
export interface ExchangeExtra { codeVerifier?: string }

export interface PlatformAdapter {
  platform: Platform
  mediaIngestion: Record<MediaKind, IngestionMode>
  /** true when the platform requires PKCE (S256); `connect` then passes
   *  `extra.codeChallenge` to authorizeUrl and `extra.codeVerifier` to exchangeCode. */
  pkce?: boolean
  authorizeUrl(creds: AppCredentials, redirectUri: string, state: string, extra?: AuthorizeExtra): string
  exchangeCode(
    creds: AppCredentials,
    code: string,
    redirectUri: string,
    fetchImpl?: Fetch,
    extra?: ExchangeExtra,
  ): Promise<Account>
  refreshToken(
    creds: AppCredentials,
    account: Account,
    fetchImpl?: Fetch,
  ): Promise<Account>
  validate(post: { text: string; media: { source: string; alt?: string }[] }): ValidationIssue[]
  publish(
    account: Account,
    post: PreparedPost,
    options: AdapterPublishOptions,
    fetchImpl?: Fetch,
  ): Promise<PublishResult>
}
```

Os três adaptadores existentes implementam `authorizeUrl(creds, redirectUri, state)` com três parâmetros — TypeScript aceita menos parâmetros, nada muda neles.

- [ ] **Step 6: Teste do `connect` (falha)**

Criar `packages/cli/src/commands/connect.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { connectWith, type ConnectDeps } from './connect.js'

function makeDeps(pkce: boolean) {
  const adapter = {
    platform: 'fake' as never,
    pkce,
    mediaIngestion: { image: 'public-url', video: 'public-url' },
    authorizeUrl: vi.fn((_c: unknown, redirect: string, state: string, extra?: { codeChallenge?: string }) =>
      `https://auth.example/?state=${state}&redirect=${encodeURIComponent(redirect)}&cc=${extra?.codeChallenge ?? ''}`),
    exchangeCode: vi.fn(async () => ({ platform: 'fake' as never, id: '1', username: 'u', accessToken: 't' })),
    refreshToken: vi.fn(),
    validate: vi.fn(() => []),
    publish: vi.fn(),
  }
  const deps: ConnectDeps = {
    adapters: { fake: adapter } as never,
    getCreds: () => ({ clientId: 'CID', clientSecret: 'CSEC' }),
    waitForCallback: vi.fn(async () => 'CODE'),
    open: vi.fn(async () => {}),
    saveAccount: vi.fn(),
    log: () => {},
  }
  return { adapter, deps }
}

describe('connectWith', () => {
  it('passes a PKCE challenge and verifier when the adapter asks for it', async () => {
    const { adapter, deps } = makeDeps(true)
    await connectWith('fake', deps)
    const [, , , authExtra] = adapter.authorizeUrl.mock.calls[0]
    const [, , , , exchangeExtra] = adapter.exchangeCode.mock.calls[0] as unknown[]
    expect(authExtra?.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect((exchangeExtra as { codeVerifier?: string }).codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deps.saveAccount).toHaveBeenCalledWith(expect.objectContaining({ username: 'u' }))
  })
  it('passes no PKCE material when the adapter does not ask', async () => {
    const { adapter, deps } = makeDeps(false)
    await connectWith('fake', deps)
    expect(adapter.authorizeUrl.mock.calls[0][3]).toBeUndefined()
    expect((adapter.exchangeCode.mock.calls[0] as unknown[])[4]).toBeUndefined()
  })
  it('rejects unknown platforms', async () => {
    const { deps } = makeDeps(false)
    await expect(connectWith('nope', deps)).rejects.toThrow(/Unknown platform "nope"/)
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm vitest run packages/cli/src/commands/connect.test.ts`
Expected: FAIL — `connectWith` não exportado.

- [ ] **Step 8: Reescrever `connect.ts`**

Substituir o conteúdo de `packages/cli/src/commands/connect.ts` por:

```ts
import open from 'open'
import {
  adapters, ensureLocalTlsCert, getAppCredentials, loadConfig, randomState, pkcePair,
  waitForCallback, REDIRECT_URI, SECURE_REDIRECT_URI, saveAccount,
  type Platform, type PlatformAdapter, type Account, type AppCredentials,
} from '@opensocial/core'

// Meta rejects http:// redirect URIs, so Instagram uses the https callback
// with a self-signed localhost cert (the browser shows a warning once —
// choose Advanced > Continue). LinkedIn and X accept http://localhost.
const NEEDS_TLS: Record<Platform, boolean> = { instagram: true, tiktok: false, youtube: false }

export interface ConnectDeps {
  adapters: Record<string, PlatformAdapter>
  getCreds: (platform: Platform) => AppCredentials
  waitForCallback: (state: string, timeoutMs?: number, tls?: ReturnType<typeof ensureLocalTlsCert>) => Promise<string>
  open: (url: string) => Promise<unknown>
  saveAccount: (account: Account) => void
  log: (line: string) => void
  /** Override for platforms (TikTok) that refuse localhost redirect URIs. */
  redirectUri?: string
  tls?: ReturnType<typeof ensureLocalTlsCert>
}

export async function connectWith(platform: string, deps: ConnectDeps): Promise<Account> {
  const adapter = deps.adapters[platform]
  if (!adapter) throw new Error(`Unknown platform "${platform}". Supported: ${Object.keys(deps.adapters).join(', ')}`)
  const p = platform as Platform
  const creds = deps.getCreds(p)
  const state = randomState()
  const redirectUri = deps.redirectUri ?? (deps.tls ? SECURE_REDIRECT_URI : REDIRECT_URI)
  const pkce = adapter.pkce ? pkcePair() : undefined
  const url = adapter.authorizeUrl(creds, redirectUri, state, pkce ? { codeChallenge: pkce.challenge } : undefined)
  deps.log(`Opening browser for ${p} authorization...\nIf it does not open, visit:\n${url}\n`)
  if (deps.tls) deps.log('Note: the browser will warn about the self-signed localhost certificate — choose Advanced > Continue.\n')
  const pendingCode = deps.waitForCallback(state, undefined, deps.tls)
  await deps.open(url)
  const code = await pendingCode
  const account = await adapter.exchangeCode(creds, code, redirectUri, undefined, pkce ? { codeVerifier: pkce.verifier } : undefined)
  deps.saveAccount(account)
  deps.log(`Connected @${account.username} (${p}).`)
  return account
}

export async function connectCommand(platform: string): Promise<void> {
  const p = platform as Platform
  const tls = p in NEEDS_TLS && NEEDS_TLS[p] ? ensureLocalTlsCert() : undefined
  await connectWith(platform, {
    adapters,
    getCreds: (pl) => getAppCredentials(loadConfig(), pl),
    waitForCallback,
    open,
    saveAccount,
    log: (line) => console.log(line),
    redirectUri: process.env.OPENSOCIAL_REDIRECT_URI,
    tls,
  })
}
```

- [ ] **Step 9: Build + testes**

Run: `pnpm -r build && pnpm test`
Expected: build limpo; todos os testes passam (os existentes + 3 de `oauth.test.ts` + 3 de `connect.test.ts`).

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/oauth.test.ts packages/cli/src/commands/connect.test.ts
git commit packages/core/src/oauth.ts packages/core/src/oauth.test.ts packages/core/src/adapter.ts packages/cli/src/commands/connect.ts packages/cli/src/commands/connect.test.ts -m "feat(core,cli): PKCE support in the adapter contract and connect flow"
```

---

### Task 2: Adaptador LinkedIn

**Files:**
- Modify: `packages/core/src/test-helpers.ts` (acrescentar `rawResponse`)
- Create: `packages/core/src/adapters/linkedin.ts`
- Create: `packages/core/src/adapters/linkedin.test.ts`
- Modify: `packages/core/src/types.ts` (`Platform`)
- Modify: `packages/core/src/adapter.ts` (registro)
- Modify: `packages/core/src/config.ts` (`AppConfig`)
- Modify: `packages/cli/src/commands/connect.ts` (`NEEDS_TLS`)

**Interfaces:**
- Consumes: contrato da Task 1 (`exchangeCode` com 5º parâmetro opcional, não usado aqui).
- Produces: `linkedinAdapter: PlatformAdapter` com `platform: 'linkedin'`, `pkce: false`; `escapeLinkedInLittleText(text: string): string` exportado (testável).

- [ ] **Step 1: Helper de resposta crua em `test-helpers.ts`**

Acrescentar:

```ts
export function rawResponse(body: string | null, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers })
}
```

- [ ] **Step 2: Testes do LinkedIn (falham)**

Criar `packages/core/src/adapters/linkedin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { linkedinAdapter, escapeLinkedInLittleText } from './linkedin.js'
import { jsonResponse, rawResponse, sequenceFetch } from '../test-helpers.js'
import { ApiError, AuthExpiredError } from '../errors.js'

const creds = { clientId: 'CID', clientSecret: 'CSEC' }
const redirect = 'http://localhost:8976/callback'
const account = { platform: 'linkedin' as const, id: 'SUB123', username: 'Lucian Fialho', accessToken: 'TOK', refreshToken: 'REF' }

function tmpJpg(): string {
  const dir = mkdtempSync(join(tmpdir(), 'li-'))
  const p = join(dir, 'card.jpg')
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  return p
}

describe('escapeLinkedInLittleText', () => {
  it('escapes reserved characters', () => {
    expect(escapeLinkedInLittleText('a (b) #c @d [e] {f} *g* _h_ ~i~ <j> |k| \\l')).toBe(
      'a \\(b\\) \\#c \\@d \\[e\\] \\{f\\} \\*g\\* \\_h\\_ \\~i\\~ \\<j\\> \\|k\\| \\\\l',
    )
  })
})

describe('authorizeUrl', () => {
  it('builds the linkedin oauth url', () => {
    const url = new URL(linkedinAdapter.authorizeUrl(creds, redirect, 'st1'))
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('redirect_uri')).toBe(redirect)
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social')
    expect(url.searchParams.get('state')).toBe('st1')
  })
})

describe('exchangeCode', () => {
  it('exchanges the code and reads userinfo', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'AT', expires_in: 5184000, refresh_token: 'RT' }),
      jsonResponse({ sub: 'SUB123', name: 'Lucian Fialho' }),
    ])
    const acc = await linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch)
    expect(calls[0].url).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('CODE')
    expect(form.get('redirect_uri')).toBe(redirect)
    expect(form.get('client_secret')).toBe('CSEC')
    expect(calls[1].url).toBe('https://api.linkedin.com/v2/userinfo')
    expect(acc).toMatchObject({ platform: 'linkedin', id: 'SUB123', username: 'Lucian Fialho', accessToken: 'AT', refreshToken: 'RT' })
    expect(new Date(acc.expiresAt!).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('refreshToken', () => {
  it('refreshes with the stored refresh token', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ access_token: 'AT2', expires_in: 100, refresh_token: 'RT2' })])
    const acc = await linkedinAdapter.refreshToken(creds, account, fetch)
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('REF')
    expect(acc.accessToken).toBe('AT2')
    expect(acc.refreshToken).toBe('RT2')
  })
  it('throws AuthExpiredError without a refresh token', async () => {
    const { fetch } = sequenceFetch([])
    await expect(linkedinAdapter.refreshToken(creds, { ...account, refreshToken: undefined }, fetch)).rejects.toBeInstanceOf(AuthExpiredError)
  })
})

describe('validate', () => {
  it('rejects empty post, long text, two images and video', () => {
    expect(linkedinAdapter.validate({ text: '', media: [] })[0].message).toMatch(/text or one image/i)
    expect(linkedinAdapter.validate({ text: 'x'.repeat(3001), media: [] })[0].message).toMatch(/3,?000/)
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }, { source: 'b.jpg' }] })[0].message).toMatch(/at most 1 image/i)
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.mp4' }] })[0].message).toMatch(/vídeo não suportado nesta versão/)
  })
  it('accepts text only and text + one image', () => {
    expect(linkedinAdapter.validate({ text: 'ok', media: [] })).toEqual([])
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }] })).toEqual([])
  })
})

describe('publish', () => {
  it('posts text with escaped commentary and returns the urn from x-restli-id', async () => {
    const { fetch, calls } = sequenceFetch([rawResponse(null, 201, { 'x-restli-id': 'urn:li:share:999' })])
    const out = await linkedinAdapter.publish(account, { text: 'Olá (mundo) #tag', media: [] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/posts')
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['LinkedIn-Version']).toBe('202601')
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0')
    expect(headers['Authorization']).toBe('Bearer TOK')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.author).toBe('urn:li:person:SUB123')
    expect(body.commentary).toBe('Olá \\(mundo\\) \\#tag')
    expect(body.lifecycleState).toBe('PUBLISHED')
    expect(body.content).toBeUndefined()
    expect(out).toEqual({ platform: 'linkedin', id: 'urn:li:share:999', url: 'https://www.linkedin.com/feed/update/urn:li:share:999' })
  })
  it('uploads the image then posts with content.media.id', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:IMG1' } }),
      rawResponse(null, 201),
      rawResponse(null, 201, { 'x-restli-id': 'urn:li:ugcPost:5' }),
    ])
    const out = await linkedinAdapter.publish(account, { text: 'legenda', media: [{ kind: 'image', filePath: tmpJpg(), alt: 'card' }] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/images?action=initializeUpload')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:SUB123' } })
    expect(calls[1].url).toBe('https://www.linkedin.com/dms-uploads/abc')
    expect(calls[1].init?.method).toBe('PUT')
    expect((calls[1].init?.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream')
    const body = JSON.parse(String(calls[2].init?.body))
    expect(body.content).toEqual({ media: { id: 'urn:li:image:IMG1', altText: 'card' } })
    expect(out.id).toBe('urn:li:ugcPost:5')
  })
  it('wraps non-2xx into ApiError with status', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"message":"nope"}', 403)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, fetch)).rejects.toMatchObject({ status: 403 })
    const { fetch: f2 } = sequenceFetch([rawResponse('{"message":"nope"}', 403)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, f2)).rejects.toBeInstanceOf(ApiError)
  })
  it('fails when x-restli-id is missing', async () => {
    const { fetch } = sequenceFetch([rawResponse(null, 201)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, fetch)).rejects.toThrow(/did not return the post URN/)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm vitest run packages/core/src/adapters/linkedin.test.ts`
Expected: FAIL — módulo `./linkedin.js` não existe.

- [ ] **Step 4: Registrar `'linkedin'` na união, no config e no `NEEDS_TLS`**

`packages/core/src/types.ts`: `export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin'`.

`packages/core/src/config.ts`, interface `AppConfig`: acrescentar `linkedin?: AppCredentials`.

`packages/cli/src/commands/connect.ts`: `const NEEDS_TLS: Record<Platform, boolean> = { instagram: true, tiktok: false, youtube: false, linkedin: false }`.

`packages/core/src/adapter.ts`: `import { linkedinAdapter } from './adapters/linkedin.js'` e na constante `adapters` acrescentar `linkedin: linkedinAdapter,`.

- [ ] **Step 5: Implementar `linkedin.ts`**

Criar `packages/core/src/adapters/linkedin.ts`:

```ts
import { readFileSync } from 'node:fs'
import type { PlatformAdapter } from '../adapter.js'
import type { Account, Fetch, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, AuthExpiredError } from '../errors.js'
import { mediaKind } from '../post.js'

const AUTH = 'https://www.linkedin.com/oauth/v2'
const API = 'https://api.linkedin.com'
const VERSION = '202601'
const MAX_TEXT = 3000

/** LinkedIn's "little text format" reserves these characters for mentions,
 *  hashtags and templates; unescaped they silently mangle the post. */
export function escapeLinkedInLittleText(text: string): string {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, '\\$&')
}

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

async function ensureOk(res: Response, context: string): Promise<Response> {
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new ApiError(`LinkedIn ${context} failed (${res.status}): ${body}`, res.status)
  }
  return res
}

async function tokenRequest(form: URLSearchParams, fetchImpl: Fetch, context: string) {
  const res = await ensureOk(
    await fetchImpl(`${AUTH}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
    context,
  )
  return res.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>
}

export const linkedinAdapter: PlatformAdapter = {
  platform: 'linkedin',
  pkce: false,
  mediaIngestion: { image: 'direct-upload', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state) {
    const u = new URL(`${AUTH}/authorization`)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('scope', 'openid profile w_member_social')
    u.searchParams.set('state', state)
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch) {
    const tok = await tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        client_id: creds.clientId, client_secret: creds.clientSecret,
      }),
      fetchImpl,
      'code exchange',
    )
    const me = await (await ensureOk(
      await fetchImpl(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } }),
      'userinfo fetch',
    )).json() as { sub: string; name?: string; given_name?: string; family_name?: string }
    const username = me.name ?? `${me.given_name ?? ''} ${me.family_name ?? ''}`.trim() || me.sub
    return {
      platform: 'linkedin', id: me.sub, username,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    if (!account.refreshToken) {
      throw new AuthExpiredError('LinkedIn token expired and no refresh token is stored; run `opensocial connect linkedin`')
    }
    const tok = await tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: account.refreshToken,
        client_id: creds.clientId, client_secret: creds.clientSecret,
      }),
      fetchImpl,
      'token refresh',
    )
    return {
      ...account,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!post.text.trim() && post.media.length === 0) issues.push({ platform: 'linkedin', message: 'LinkedIn post needs text or one image.' })
    if (post.text.length > MAX_TEXT) issues.push({ platform: 'linkedin', message: `Text is ${post.text.length} chars; LinkedIn allows at most 3000.` })
    const images = post.media.filter((m) => mediaKind(m.source) === 'image')
    if (images.length > 1) issues.push({ platform: 'linkedin', message: `Post has ${images.length} images; this version supports at most 1 image.` })
    if (post.media.some((m) => mediaKind(m.source) === 'video')) issues.push({ platform: 'linkedin', message: 'LinkedIn: vídeo não suportado nesta versão.' })
    return issues
  },

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    const author = `urn:li:person:${account.id}`
    const image = post.media.find((m) => m.kind === 'image')
    let content: { media: { id: string; altText?: string } } | undefined

    if (image) {
      if (!image.filePath) throw new ApiError('LinkedIn image must be a local file (direct upload)', 400)
      const init = await (await ensureOk(
        await fetchImpl(`${API}/rest/images?action=initializeUpload`, {
          method: 'POST', headers: restHeaders(token),
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        }),
        'image initializeUpload',
      )).json() as { value: { uploadUrl: string; image: string } }
      await ensureOk(
        await fetchImpl(init.value.uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
          body: readFileSync(image.filePath),
        }),
        'image upload',
      )
      content = { media: { id: init.value.image, ...(image.alt ? { altText: image.alt } : {}) } }
    }

    const res = await ensureOk(
      await fetchImpl(`${API}/rest/posts`, {
        method: 'POST', headers: restHeaders(token),
        body: JSON.stringify({
          author,
          commentary: escapeLinkedInLittleText(post.text),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
          ...(content ? { content } : {}),
        }),
      }),
      'post creation',
    )
    const urn = res.headers.get('x-restli-id')
    if (!urn) throw new ApiError('LinkedIn did not return the post URN (x-restli-id header missing)', 500)
    return { platform: 'linkedin', id: urn, url: `https://www.linkedin.com/feed/update/${urn}` }
  },
}
```

- [ ] **Step 6: Build + testes**

Run: `pnpm -r build && pnpm test`
Expected: build limpo; `linkedin.test.ts` 11 pass; resto verde.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/adapters/linkedin.ts packages/core/src/adapters/linkedin.test.ts
git commit packages/core/src/adapters/linkedin.ts packages/core/src/adapters/linkedin.test.ts packages/core/src/test-helpers.ts packages/core/src/types.ts packages/core/src/adapter.ts packages/core/src/config.ts packages/cli/src/commands/connect.ts -m "feat(core): linkedin adapter — personal profile posts with optional image"
```

---

### Task 3: Adaptador X

**Files:**
- Create: `packages/core/src/adapters/x.ts`
- Create: `packages/core/src/adapters/x.test.ts`
- Modify: `packages/core/src/types.ts` (`Platform`)
- Modify: `packages/core/src/adapter.ts` (registro)
- Modify: `packages/core/src/config.ts` (`AppConfig`)
- Modify: `packages/cli/src/commands/connect.ts` (`NEEDS_TLS`)

**Interfaces:**
- Consumes: `AuthorizeExtra.codeChallenge` e `ExchangeExtra.codeVerifier` (Task 1); `rawResponse` (Task 2).
- Produces: `xAdapter: PlatformAdapter` com `platform: 'x'`, `pkce: true`; `weightedLength(text: string): number` exportado.

- [ ] **Step 1: Testes do X (falham)**

Criar `packages/core/src/adapters/x.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { xAdapter, weightedLength } from './x.js'
import { jsonResponse, rawResponse, sequenceFetch } from '../test-helpers.js'
import { ApiError, AuthExpiredError, RateLimitError } from '../errors.js'

const creds = { clientId: 'CID', clientSecret: 'CSEC' }
const redirect = 'http://localhost:8976/callback'
const account = { platform: 'x' as const, id: '42', username: 'oagentico', accessToken: 'TOK', refreshToken: 'REF' }
const basic = 'Basic ' + Buffer.from('CID:CSEC').toString('base64')

function tmpJpg(): string {
  const dir = mkdtempSync(join(tmpdir(), 'x-'))
  const p = join(dir, 'card.jpg')
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  return p
}

describe('weightedLength', () => {
  it('counts urls as 23 and other text by code point', () => {
    expect(weightedLength('abc')).toBe(3)
    expect(weightedLength('veja https://oagentico.com.br/evento/123456789 agora')).toBe(5 + 23 + 6)
    expect(weightedLength('🚀🚀')).toBe(2)
  })
})

describe('authorizeUrl', () => {
  it('builds the x oauth2 url with pkce', () => {
    const url = new URL(xAdapter.authorizeUrl(creds, redirect, 'st1', { codeChallenge: 'CHAL' }))
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('redirect_uri')).toBe(redirect)
    expect(url.searchParams.get('scope')).toBe('tweet.read tweet.write users.read offline.access')
    expect(url.searchParams.get('state')).toBe('st1')
    expect(url.searchParams.get('code_challenge')).toBe('CHAL')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
  it('refuses to build without a challenge', () => {
    expect(() => xAdapter.authorizeUrl(creds, redirect, 'st1')).toThrow(/PKCE/)
  })
})

describe('exchangeCode', () => {
  it('exchanges with basic auth + verifier and reads users/me', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }),
      jsonResponse({ data: { id: '42', username: 'oagentico' } }),
    ])
    const acc = await xAdapter.exchangeCode(creds, 'CODE', redirect, fetch, { codeVerifier: 'VER' })
    expect(calls[0].url).toBe('https://api.x.com/2/oauth2/token')
    expect((calls[0].init?.headers as Record<string, string>)['Authorization']).toBe(basic)
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code_verifier')).toBe('VER')
    expect(form.get('redirect_uri')).toBe(redirect)
    expect(form.get('client_id')).toBe('CID')
    expect(calls[1].url).toBe('https://api.x.com/2/users/me')
    expect(acc).toMatchObject({ platform: 'x', id: '42', username: 'oagentico', accessToken: 'AT', refreshToken: 'RT' })
  })
})

describe('refreshToken', () => {
  it('returns the NEW refresh token (single use)', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 7200 })])
    const acc = await xAdapter.refreshToken(creds, account, fetch)
    expect((calls[0].init?.headers as Record<string, string>)['Authorization']).toBe(basic)
    expect(new URLSearchParams(String(calls[0].init?.body)).get('grant_type')).toBe('refresh_token')
    expect(acc.refreshToken).toBe('RT2')
    expect(acc.accessToken).toBe('AT2')
  })
  it('turns a 400 (used/revoked refresh token) into AuthExpiredError', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"error":"invalid_request"}', 400)])
    await expect(xAdapter.refreshToken(creds, account, fetch)).rejects.toBeInstanceOf(AuthExpiredError)
  })
})

describe('validate', () => {
  it('rejects empty, over 280 weighted, two images and video', () => {
    expect(xAdapter.validate({ text: '', media: [] })[0].message).toMatch(/text or one image/i)
    const long = 'x'.repeat(235) + ' https://a.b/c https://d.e/f'
    expect(xAdapter.validate({ text: long, media: [] })[0].message).toMatch(/280/)
    expect(xAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }, { source: 'b.jpg' }] })[0].message).toMatch(/at most 1 image/i)
    expect(xAdapter.validate({ text: 'ok', media: [{ source: 'a.mp4' }] })[0].message).toMatch(/vídeo não suportado nesta versão/)
  })
  it('accepts 280 weighted exactly', () => {
    const text = 'x'.repeat(234) + ' https://oagentico.com.br/qualquer/coisa/longa/aqui/mesmo'
    expect(weightedLength(text)).toBe(258)
    expect(xAdapter.validate({ text, media: [{ source: 'a.jpg' }] })).toEqual([])
  })
})

describe('publish', () => {
  it('posts text only', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ data: { id: '777', text: 'oi' } }, 201)])
    const out = await xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.x.com/2/tweets')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: 'oi' })
    expect(out).toEqual({ platform: 'x', id: '777', url: 'https://x.com/oagentico/status/777' })
  })
  it('uploads the image (multipart) then tweets with media_ids', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ data: { id: 'MEDIA1', media_key: '3_MEDIA1' } }),
      jsonResponse({ data: { id: '778', text: 'legenda' } }, 201),
    ])
    const out = await xAdapter.publish(account, { text: 'legenda', media: [{ kind: 'image', filePath: tmpJpg() }] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.x.com/2/media/upload')
    const form = calls[0].init?.body as FormData
    expect(form.get('media_category')).toBe('tweet_image')
    expect(form.get('media')).toBeInstanceOf(Blob)
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ text: 'legenda', media: { media_ids: ['MEDIA1'] } })
    expect(out.id).toBe('778')
  })
  it('maps 429 to RateLimitError with retryAfterSeconds from x-rate-limit-reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 90
    const { fetch } = sequenceFetch([rawResponse('{"title":"Too Many Requests"}', 429, { 'x-rate-limit-reset': String(reset) })])
    const err = await xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.retryAfterSeconds).toBeGreaterThan(60)
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(90)
  })
  it('wraps other non-2xx into ApiError', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"title":"Forbidden"}', 403)])
    await expect(xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch)).rejects.toMatchObject({ status: 403 })
    const { fetch: f2 } = sequenceFetch([rawResponse('{"title":"Forbidden"}', 403)])
    await expect(xAdapter.publish(account, { text: 'oi', media: [] }, {}, f2)).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run packages/core/src/adapters/x.test.ts`
Expected: FAIL — módulo `./x.js` não existe.

- [ ] **Step 3: Registrar `'x'` na união, no config e no `NEEDS_TLS`**

`packages/core/src/types.ts`: `export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x'`.

`packages/core/src/config.ts`, `AppConfig`: acrescentar `x?: AppCredentials`.

`packages/cli/src/commands/connect.ts`: `NEEDS_TLS` ganha `x: false`.

`packages/core/src/adapter.ts`: `import { xAdapter } from './adapters/x.js'` e `x: xAdapter,` no registro.

- [ ] **Step 4: Implementar `x.ts`**

Criar `packages/core/src/adapters/x.ts`:

```ts
import { readFileSync } from 'node:fs'
import type { PlatformAdapter } from '../adapter.js'
import type { Fetch, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, AuthExpiredError, RateLimitError } from '../errors.js'
import { mediaKind } from '../post.js'

const API = 'https://api.x.com/2'
const AUTHORIZE = 'https://x.com/i/oauth2/authorize'
const SCOPES = 'tweet.read tweet.write users.read offline.access'
const MAX_WEIGHTED = 280
const URL_WEIGHT = 23

/** X counts every URL as 23 chars and everything else by code point. */
export function weightedLength(text: string): number {
  let total = 0
  const rest = text.replace(/https?:\/\/\S+/g, () => { total += URL_WEIGHT; return '' })
  return total + [...rest].length
}

function basicAuth(creds: { clientId: string; clientSecret: string }): string {
  return 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
}

async function ensureOk(res: Response, context: string): Promise<Response> {
  if (res.ok) return res
  const body = (await res.text()).slice(0, 300)
  if (res.status === 429) {
    const reset = Number(res.headers.get('x-rate-limit-reset'))
    const retryAfter = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : undefined
    throw new RateLimitError(`X ${context} rate limited (429): ${body}`, retryAfter)
  }
  throw new ApiError(`X ${context} failed (${res.status}): ${body}`, res.status)
}

async function tokenRequest(creds: { clientId: string; clientSecret: string }, form: URLSearchParams, fetchImpl: Fetch, context: string) {
  const res = await ensureOk(
    await fetchImpl(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: basicAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
    context,
  )
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

export const xAdapter: PlatformAdapter = {
  platform: 'x',
  pkce: true,
  mediaIngestion: { image: 'direct-upload', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state, extra) {
    if (!extra?.codeChallenge) throw new Error('X requires PKCE: authorizeUrl needs extra.codeChallenge')
    const u = new URL(AUTHORIZE)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('scope', SCOPES)
    u.searchParams.set('state', state)
    u.searchParams.set('code_challenge', extra.codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch, extra) {
    if (!extra?.codeVerifier) throw new Error('X requires PKCE: exchangeCode needs extra.codeVerifier')
    const tok = await tokenRequest(
      creds,
      new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        code_verifier: extra.codeVerifier, client_id: creds.clientId,
      }),
      fetchImpl,
      'code exchange',
    )
    const me = await (await ensureOk(
      await fetchImpl(`${API}/users/me`, { headers: { Authorization: `Bearer ${tok.access_token}` } }),
      'users/me fetch',
    )).json() as { data: { id: string; username: string } }
    return {
      platform: 'x', id: me.data.id, username: me.data.username,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    if (!account.refreshToken) {
      throw new AuthExpiredError('X token expired and no refresh token is stored; run `opensocial connect x`')
    }
    let tok
    try {
      tok = await tokenRequest(
        creds,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: account.refreshToken }),
        fetchImpl,
        'token refresh',
      )
    } catch (err) {
      // a refresh token is single-use: a 400 here means it was already spent or revoked
      if (err instanceof ApiError && err.status === 400) {
        throw new AuthExpiredError(`X refresh token rejected (${err.message}); run \`opensocial connect x\``)
      }
      throw err
    }
    return {
      ...account,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!post.text.trim() && post.media.length === 0) issues.push({ platform: 'x', message: 'X post needs text or one image.' })
    const w = weightedLength(post.text)
    if (w > MAX_WEIGHTED) issues.push({ platform: 'x', message: `Text weighs ${w} chars (URLs count 23); X allows at most 280.` })
    const images = post.media.filter((m) => mediaKind(m.source) === 'image')
    if (images.length > 1) issues.push({ platform: 'x', message: `Post has ${images.length} images; this version supports at most 1 image.` })
    if (post.media.some((m) => mediaKind(m.source) === 'video')) issues.push({ platform: 'x', message: 'X: vídeo não suportado nesta versão.' })
    return issues
  },

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    const image = post.media.find((m) => m.kind === 'image')
    let mediaIds: string[] | undefined

    if (image) {
      if (!image.filePath) throw new ApiError('X image must be a local file (direct upload)', 400)
      const form = new FormData()
      form.append('media', new Blob([readFileSync(image.filePath)], { type: 'image/jpeg' }), 'image.jpg')
      form.append('media_category', 'tweet_image')
      const up = await (await ensureOk(
        await fetchImpl(`${API}/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }),
        'media upload',
      )).json() as { data?: { id?: string; media_id_string?: string }; media_id_string?: string }
      const id = up.data?.id ?? up.data?.media_id_string ?? up.media_id_string
      if (!id) throw new ApiError('X media upload returned no media id', 500)
      mediaIds = [id]
    }

    const out = await (await ensureOk(
      await fetchImpl(`${API}/tweets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: post.text, ...(mediaIds ? { media: { media_ids: mediaIds } } : {}) }),
      }),
      'tweet creation',
    )).json() as { data: { id: string } }
    return { platform: 'x', id: out.data.id, url: `https://x.com/${account.username}/status/${out.data.id}` }
  },
}
```

Nota: `FormData`/`Blob` são globais no Node ≥ 20; o `fetch` nativo gera o `multipart/form-data` com boundary sozinho — NÃO setar `Content-Type` manualmente nessa chamada.

- [ ] **Step 5: Build + testes**

Run: `pnpm -r build && pnpm test`
Expected: build limpo; `x.test.ts` 12 pass; resto verde.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/x.ts packages/core/src/adapters/x.test.ts
git commit packages/core/src/adapters/x.ts packages/core/src/adapters/x.test.ts packages/core/src/types.ts packages/core/src/adapter.ts packages/core/src/config.ts packages/cli/src/commands/connect.ts -m "feat(core): x adapter — pkce oauth, single-use refresh, text + one image"
```

---

### Task 4: CLI, README, guias de setup e verificação manual

**Files:**
- Modify: `packages/cli/src/index.ts` (texto de `--to`)
- Modify: `README.md` (tabela "Supported platforms", bloco de `config.json`)
- Create: `docs/setup-linkedin.md`
- Create: `docs/setup-x.md`

- [ ] **Step 1: Ajuda do `--to`**

Em `packages/cli/src/index.ts`, trocar `'comma-separated: instagram,tiktok'` por `'comma-separated: instagram,tiktok,youtube,linkedin,x'`.

- [ ] **Step 2: README**

Na tabela "Supported platforms (v1)", acrescentar depois da linha do TikTok:

```markdown
| LinkedIn | text, text + 1 image | direct upload | personal profile via the self-serve "Share on LinkedIn" product (`w_member_social`) — see [setup guide](docs/setup-linkedin.md) |
| X | text, text + 1 image (≤ 280 weighted chars, URLs count 23) | direct upload | OAuth 2.0 with PKCE; pay-per-use API (a post with a link costs ~13× one without) — see [setup guide](docs/setup-x.md) |
```

No bloco de exemplo do `config.json` (Quickstart), acrescentar as duas chaves:

```json
{
  "instagram": { "clientId": "...", "clientSecret": "..." },
  "tiktok": { "clientId": "...", "clientSecret": "...", "privacyLevel": "SELF_ONLY" },
  "linkedin": { "clientId": "...", "clientSecret": "..." },
  "x": { "clientId": "...", "clientSecret": "..." }
}
```

E na lista de comandos `connect`, acrescentar `opensocial connect linkedin` e `opensocial connect x`.

- [ ] **Step 3: `docs/setup-linkedin.md`**

```markdown
# LinkedIn setup

OpenSocial posts to a **personal profile** through the self-serve "Share on LinkedIn" product.
Company pages need the Community Management API (manual review) and are not supported yet.

1. Open https://www.linkedin.com/developers/apps and create an app (or reuse one). It must be
   associated with a LinkedIn Page you administer.
2. **Products** tab → add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
   Both are self-serve; the scopes `openid`, `profile` and `w_member_social` appear under Auth.
3. **Auth** tab → "Authorized redirect URLs for your app" → add exactly
   `http://localhost:8976/callback` (LinkedIn accepts http for localhost).
4. Copy Client ID and Primary Client Secret into `~/.config/opensocial/config.json`:

   ```json
   { "linkedin": { "clientId": "...", "clientSecret": "..." } }
   ```

5. `opensocial connect linkedin` — the browser opens; authorize with the profile that should post.
   The account is stored as `linkedin` in `accounts.json` with the member URN id.

Notes:
- Access tokens last ~60 days. Refresh tokens are only issued to apps enrolled in the
  programmatic-refresh program; without one, run `opensocial connect linkedin` again when posts
  start failing with 401.
- Text goes through LinkedIn's "little text format" escaping automatically (`()[]{}@#*_~<>|\`).
- Posts are created with `visibility: PUBLIC` on the main feed.
```

- [ ] **Step 4: `docs/setup-x.md`**

```markdown
# X setup

1. Open https://console.x.com and create a project + app (or reuse one). The app must be
   attached to a project; the API is **pay-per-use** — add credits under Billing → Credits
   before the first post (a text/image post costs ~US$0.015; a post containing a link ~US$0.20).
2. App → **Settings** (authentication settings):
   - App permissions: **Read and write**.
   - Type of App: **Web App, Automated App or Bot** (confidential client — OpenSocial sends the
     client secret with HTTP Basic auth on the token endpoint).
   - Callback URI / Redirect URL: add exactly `http://localhost:8976/callback`.
   - Website URL: any valid URL.
3. App → **Keys & Tokens** → OAuth 2.0 → copy Client ID and Client Secret into
   `~/.config/opensocial/config.json`:

   ```json
   { "x": { "clientId": "...", "clientSecret": "..." } }
   ```

4. `opensocial connect x` — the browser opens; log in as the account that should post
   (e.g. the brand account, not your personal one) and authorize.

Notes:
- OAuth 2.0 with PKCE (S256); scopes `tweet.read tweet.write users.read offline.access`.
- Access tokens last 2 hours; OpenSocial refreshes on 401. **Refresh tokens are single-use** —
  only one machine should publish with a given connected account, or they will invalidate each other.
- 280 characters weighted: every URL counts as 23.
- Image upload uses `POST /2/media/upload` (`media_category=tweet_image`). Video is not supported yet.
```

- [ ] **Step 5: Build + testes + verificação manual**

```bash
pnpm -r build && pnpm test
node packages/cli/dist/index.js --help | grep -- '--to'
```

Expected: verde; a ajuda mostra `instagram,tiktok,youtube,linkedin,x`.

Verificação manual (precisa dos secrets em `~/.config/opensocial/config.json` e, pro X, crédito na conta de desenvolvedor — ambos são do Lucian):

```bash
node packages/cli/dist/index.js connect linkedin
node packages/cli/dist/index.js connect x
node packages/cli/dist/index.js accounts
node packages/cli/dist/index.js post --to linkedin,x \
  --text "Atacantes exploram falha de autorização no Drupal Commerce Core e ameaçam vendedores. Confirmado por 2 fontes independentes." \
  --media /Users/lucianfialho/orca/projects/oagentico_social/out/static/news-34875.jpg
```

Expected: duas linhas `published` com URL; abrir as duas no browser e conferir imagem + texto. Se os secrets ou o crédito não estiverem disponíveis, registrar no commit que a verificação manual ficou pendente e por quê.

- [ ] **Step 6: Commit**

```bash
git add docs/setup-linkedin.md docs/setup-x.md
git commit packages/cli/src/index.ts README.md docs/setup-linkedin.md docs/setup-x.md -m "docs: linkedin and x setup guides, README platform table, --to help text"
```
