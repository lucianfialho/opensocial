# Adaptadores de LinkedIn e X no opensocial — design

Escrito em 31/10/2026. Peça 2 da decisão de focar em distribuição do agêntico
(peça 1, o post estático no Instagram, entrou no ar no mesmo dia). A Rayssa
(`~/conductor/workspaces/thedevhype.com/london/app/lib/mcp/servers/rayssa.ts`) serve
APENAS de referência de código: nada dela fica rodando, o MCP do thedevhype não entra.

## O que é

Dois adaptadores novos no `@opensocial/core`, `linkedin` e `x`, com o mesmo contrato
dos existentes: `connect` via OAuth no callback local, `accounts` lista a conta,
`post --to linkedin,x --text ... --media card.jpg` publica **texto + no máximo uma
imagem** nas duas redes. Refresh de token em 401 e armazenamento em `accounts.json`
saem de graça do fluxo que já existe.

Contas-alvo: **@oagentico** no X (conta de marca) e **o perfil pessoal do Lucian** no
LinkedIn (produto self-serve "Share on LinkedIn", escopo `w_member_social`). Apps de
desenvolvedor: os mesmos já registrados pra Rayssa, com o redirect
`http://localhost:8976/callback` adicionado em cada portal.

## Fora de escopo

- Vídeo (upload chunked no X, Videos API no LinkedIn) — peça 5 decide.
- Threads/sequência de posts no X, reply (peça 4 tem spec própria).
- Página de empresa no LinkedIn (`w_organization_social`, exige revisão da Community
  Management API). O adaptador grava o `author` como `urn:li:person:<id>`; trocar pra
  `urn:li:organization:<id>` é um campo quando a aprovação sair.
- Threads (Meta) — a Rayssa tem, não é pedido.
- Qualquer mudança no `oagentico_social`: a peça 3 é que decide o que postar.

## Arquitetura

```
opensocial connect x            opensocial connect linkedin
  │ (PKCE)                        │
  ▼                               ▼
adapters/x.ts                  adapters/linkedin.ts
  authorizeUrl/exchangeCode      authorizeUrl/exchangeCode
  refreshToken                   refreshToken
  validate                       validate
  publish ──► media/upload ──► tweets      publish ──► images initializeUpload ──► PUT bytes ──► rest/posts
```

Tudo passa pelo `publishToAll` existente (`core/src/publish.ts`): validação de todas as
redes antes da primeira chamada, `resolveMedia` com `direct-upload` (arquivo local vai
como bytes, sem media host), refresh em 401, 429 vira `RateLimitError`.

### 1. Contrato (`core/src/types.ts`, `core/src/adapter.ts`, `cli/src/commands/connect.ts`)

- `Platform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x'`.
- `PlatformAdapter` ganha `pkce?: boolean` (default `false`).
- `authorizeUrl(creds, redirectUri, state, extra?: { codeChallenge?: string })` e
  `exchangeCode(creds, code, redirectUri, fetchImpl?, extra?: { codeVerifier?: string })`.
  O quarto/quinto parâmetro é opcional; os três adaptadores atuais não o leem e não mudam.
- `connect.ts`: quando `adapters[p].pkce` é verdadeiro, gera `codeVerifier` (43–128
  chars, `base64url` de 32 bytes aleatórios) e `codeChallenge = base64url(sha256(verifier))`,
  passa o challenge no `authorizeUrl` e o verifier no `exchangeCode`. Função pura
  `pkcePair()` em `core/src/oauth.ts`, testável. `NEEDS_TLS` ganha `linkedin: false`,
  `x: false` (os dois aceitam `http://localhost`).
- `config.ts`: `AppConfig` ganha `linkedin?: AppCredentials` e `x?: AppCredentials`.
  `getAppCredentials` já resolve `OPENSOCIAL_LINKEDIN_CLIENT_ID/SECRET` e
  `OPENSOCIAL_X_CLIENT_ID/SECRET` pelo nome da plataforma em caixa alta.
- `adapters` em `adapter.ts` registra os dois; `cli/src/index.ts` atualiza o texto de
  ajuda de `--to` pra `instagram,tiktok,youtube,linkedin,x`.

### 2. Adaptador LinkedIn (`core/src/adapters/linkedin.ts`)

| | |
|---|---|
| `pkce` | `false` |
| `mediaIngestion` | `{ image: 'direct-upload', video: 'direct-upload' }` (vídeo é rejeitado em `validate`) |
| `authorizeUrl` | `https://www.linkedin.com/oauth/v2/authorization` com `response_type=code`, `scope=openid profile w_member_social`, `client_id`, `redirect_uri`, `state` |
| `exchangeCode` | `POST https://www.linkedin.com/oauth/v2/accessToken` (form: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`) → `{access_token, expires_in, refresh_token?}`; depois `GET https://api.linkedin.com/v2/userinfo` → `{sub, name}`. Conta: `id = sub`, `username = name`, `refreshToken` quando vier, `expiresAt = now + expires_in` |
| `refreshToken` | `POST .../accessToken` com `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`. Sem `refreshToken` na conta → lança `AuthExpiredError('LinkedIn token expirado e sem refresh token; rode opensocial connect linkedin')` |
| `validate` | texto vazio e sem mídia → erro; texto > 3000 chars → erro; mais de 1 item de mídia → erro; qualquer vídeo → erro "vídeo não suportado nesta versão" |
| `publish` | ver abaixo |

Headers de toda chamada `api.linkedin.com/rest/*`: `Authorization: Bearer`,
`LinkedIn-Version: 202601`, `X-Restli-Protocol-Version: 2.0.0`, `Content-Type: application/json`.

Publicação:
1. Texto passa por `escapeLinkedInLittleText` (portado da Rayssa: escapa
   `\ | { } @ [ ] ( ) < > # * _ ~` com barra invertida). Vai no campo `commentary`.
2. Se houver imagem: `POST /rest/images?action=initializeUpload` com
   `{initializeUploadRequest: {owner: "urn:li:person:<account.id>"}}` →
   `{value: {uploadUrl, image}}`; `PUT uploadUrl` com os bytes do arquivo
   (`Authorization: Bearer`, `Content-Type: application/octet-stream`); `image` é a URN
   `urn:li:image:...`.
3. `POST /rest/posts` com `{author: "urn:li:person:<id>", commentary, visibility: "PUBLIC",
   distribution: {feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: []},
   lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false}` e, com imagem,
   `content: {media: {id: "<urn:li:image>", altText?: alt}}`.
4. Resultado: `id` = header `x-restli-id` (URN `urn:li:share:N` ou `urn:li:ugcPost:N`),
   `url = https://www.linkedin.com/feed/update/<urn>`.

Erros: qualquer não-2xx vira `ApiError(\`LinkedIn <contexto> failed (<status>): <corpo até 300 chars>\`, status)`.
401 deixa o `publishToAll` tentar o refresh; 429 vira `RateLimitError` pelo fluxo existente.

### 3. Adaptador X (`core/src/adapters/x.ts`)

| | |
|---|---|
| `pkce` | `true` |
| `mediaIngestion` | `{ image: 'direct-upload', video: 'direct-upload' }` (vídeo rejeitado em `validate`) |
| `authorizeUrl` | `https://x.com/i/oauth2/authorize` com `response_type=code`, `client_id`, `redirect_uri`, `scope=tweet.read tweet.write users.read offline.access`, `state`, `code_challenge`, `code_challenge_method=S256` |
| `exchangeCode` | `POST https://api.x.com/2/oauth2/token` com `Authorization: Basic base64(clientId:clientSecret)` (client confidencial, como a Rayssa) e form `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `client_id` → `{access_token, refresh_token, expires_in}`; depois `GET https://api.x.com/2/users/me` → `{data: {id, username}}` |
| `refreshToken` | `POST .../oauth2/token` com Basic auth e `grant_type=refresh_token`, `refresh_token`. **O refresh token do X é de uso único**: a conta devolvida carrega o novo `refresh_token`, e o `publishToAll` já salva via `saveAccount` |
| `validate` | texto vazio e sem mídia → erro; comprimento ponderado > 280 → erro (cada URL `https?://\S+` conta 23, o resto conta por code point); mais de 1 imagem → erro; vídeo → erro "vídeo não suportado nesta versão" |
| `publish` | ver abaixo |

Publicação:
1. Se houver imagem: `POST https://api.x.com/2/media/upload` multipart (`media` = bytes do
   arquivo, `media_category=tweet_image`) → `{data: {id}}` (o campo é `id`; aceitar também
   `media_id_string` por compatibilidade com respostas antigas). Se vier `alt`, não há
   endpoint v2 estável pra alt text nesta versão — ignorar e anotar em `note`.
2. `POST https://api.x.com/2/tweets` com `{text, media?: {media_ids: [id]}}` → `{data: {id}}`.
3. Resultado: `id`, `url = https://x.com/<account.username>/status/<id>`.

Custo (pay-per-use, conferido 31/10/2026): post sem link ≈ US$0,015, post com link ≈
US$0,20. O adaptador não proíbe link; a decisão de incluir ou não é de quem chama
(peça 3). `validate` não alerta sobre custo.

Erros: não-2xx → `ApiError(\`X <contexto> failed (<status>): <corpo até 300 chars>\`, status)`;
429 → `RateLimitError` com `retryAfterSeconds` lido de `x-rate-limit-reset` quando presente.

### 4. CLI e documentação

- `connect.ts`: caminho PKCE descrito em §1; mensagem final continua `Connected @<username> (<p>).`
- `index.ts`: texto da opção `--to`.
- `README.md`: tabela "Supported platforms" ganha as duas linhas (formatos: texto, texto+1 imagem; ingestão: direct upload; notas: LinkedIn = perfil pessoal via Share on LinkedIn; X = pay-per-use, PKCE).
- `docs/setup-linkedin.md` e `docs/setup-x.md`: o que registrar no portal (produto Share on LinkedIn; app do X com OAuth 2.0 tipo "Web App / confidential", pay-per-use ligado), o redirect `http://localhost:8976/callback`, o bloco do `config.json`, e o comando `connect`.

## Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Refresh token do X já usado/revogado (400 `invalid_request`) | `refreshToken` lança `AuthExpiredError` com instrução de `connect x`; `publishToAll` repassa como falha da plataforma |
| LinkedIn sem `refresh_token` na troca (comum em apps sem o produto de refresh) | conta salva sem `refreshToken`; em 401 o `refreshToken` lança `AuthExpiredError`; reconectar a cada ~60 dias |
| `x-restli-id` ausente na resposta do LinkedIn | `ApiError` 500 "LinkedIn did not return the post URN" |
| Upload de imagem ok, criação do post falha | a imagem fica órfã na conta (LinkedIn/X limpam sozinhos); o erro do post é o que sobe |
| Imagem > 5 MB no X / > 8 MB no LinkedIn | `validate` não checa tamanho; a API responde 4xx e vira `ApiError` — mesma política do Instagram hoje |
| Texto só com imagem e sem texto | permitido nas duas redes (`commentary: ""` / `text` omitido) |

## Testes

Vitest, mesmo molde de `instagram.test.ts` (`sequenceFetch` + `jsonResponse` de
`test-helpers.ts`; adicionar um `textResponse`/`headersResponse` se faltar pra simular
`x-restli-id` e corpo vazio).

- `core/src/oauth.test.ts`: `pkcePair()` gera verifier de 43 chars base64url e challenge =
  base64url(sha256(verifier)) (vetor conhecido do RFC 7636 Apêndice B).
- `core/src/adapters/linkedin.test.ts`: `authorizeUrl` (escopos, state); `exchangeCode`
  (duas chamadas, conta com `sub`/`name`); `refreshToken` com e sem refresh token;
  `validate` (vazio, >3000, 2 imagens, vídeo); `publish` texto (escape aplicado, URN do
  header, URL); `publish` com imagem (três chamadas na ordem initializeUpload → PUT →
  posts, `content.media.id` igual à URN); 4xx vira `ApiError` com status.
- `core/src/adapters/x.test.ts`: `authorizeUrl` com `code_challenge`/`S256`; `exchangeCode`
  com Basic auth e `code_verifier` no form; `refreshToken` devolve o refresh novo;
  `validate` (280 ponderado: 2 URLs + texto; 1 imagem ok; 2 imagens erro; vídeo erro);
  `publish` texto e texto+imagem (upload multipart antes do tweet, `media_ids`); 429 vira
  `RateLimitError` com `retryAfterSeconds`.
- `cli/src/commands/connect.test.ts` (novo): com `adapters` e `open` mockados, plataforma
  `pkce` recebe challenge no `authorizeUrl` e verifier no `exchangeCode`; plataforma sem
  `pkce` não recebe nada.
- `core/src/live.test.ts` já existe pra Instagram com env real; NÃO estender agora.
- Verificação manual obrigatória: `connect linkedin`, `connect x`, `accounts`, e
  `post --to linkedin,x --text "<legenda do card>" --media <jpg já publicado no Instagram>`;
  conferir as duas URLs devolvidas no browser.

## Por quê

- **Por que adaptador nativo e não a Rayssa**: decisão do Lucian em 31/10. A Rayssa vive
  dentro de um Next.js com banco e sessão de usuário; o opensocial é um CLI BYO sem serviço
  no meio, e o oagentico_social já o chama como processo filho. Portar a lógica mantém a
  regra "publicação mora no opensocial".
- **Por que texto + 1 imagem**: reaproveita o card estático da peça 1 nas três redes. No
  X, post sem link custa 13× menos que com link; no LinkedIn, imagem nativa tem mais alcance
  que link no corpo.
- **Por que PKCE como extensão opcional do contrato**: o X exige; Instagram/TikTok/YouTube
  não usam. Um campo booleano mais dois parâmetros opcionais é a menor mudança que não
  quebra os adaptadores existentes.
- **Por que perfil pessoal no LinkedIn**: é self-serve. Página de empresa exige revisão da
  Community Management API, que leva semanas. O `author` é um campo só.
- **Por que `direct-upload` e não media host**: as duas APIs aceitam bytes; usar o Vercel
  Blob só adicionaria um upload e uma limpeza sem ganho.

## Pendências fora do código (31/10/2026)

- **Página do agêntico no LinkedIn.** Criar manualmente em linkedin.com/company/setup/new
  (logo, descrição, URL oagentico.com.br). Não depende do código. Depois, no app
  "Rayssa by thedevhype", solicitar o produto **Community Management API** apontando pra essa
  página; a revisão é humana e leva semanas. Enquanto não sai, os posts vão no perfil pessoal
  (`urn:li:person`). Quando sair, o adaptador troca o `author` pra `urn:li:organization:<id>`
  (um campo) e o `connect` precisa guardar o id da organização — pequena peça própria.
- **Crédito na conta de desenvolvedor do X.** Saldo em US$0,00 em 31/10; o modelo é pré-pago.
  Sem crédito, `connect x` funciona mas `post --to x` falha com 402/403.
- **Secrets no `config.json`.** Client IDs dos dois apps já estão em
  `~/.config/opensocial/config.json`; os secrets ficam com o Lucian.
