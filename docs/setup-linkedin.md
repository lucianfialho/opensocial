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
6. First post:

   ```bash
   opensocial post --to linkedin --text "hello from opensocial" --media ./card.jpg
   ```

Notes:
- `OPENSOCIAL_LINKEDIN_CLIENT_ID` / `OPENSOCIAL_LINKEDIN_CLIENT_SECRET` env vars override
  `clientId`/`clientSecret` from `config.json` — useful for CI.
- Access tokens last ~60 days. Refresh tokens are only issued to apps enrolled in the
  programmatic-refresh program; without one, run `opensocial connect linkedin` again when posts
  start failing with 401.
- Text goes through LinkedIn's "little text format" escaping automatically (`()[]{}@#*_~<>|\`).
- Posts are created with `visibility: PUBLIC` on the main feed.
