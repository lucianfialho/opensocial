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
5. First post:

   ```bash
   opensocial post --to x --text "hello from opensocial" --media ./card.jpg
   ```

Notes:
- `OPENSOCIAL_X_CLIENT_ID` / `OPENSOCIAL_X_CLIENT_SECRET` env vars override
  `clientId`/`clientSecret` from `config.json` — useful for CI.
- OAuth 2.0 with PKCE (S256); scopes `tweet.read tweet.write users.read offline.access`.
- Access tokens last 2 hours; OpenSocial refreshes on 401. **Refresh tokens are single-use** —
  only one machine should publish with a given connected account, or they will invalidate each other.
- 280 characters weighted: every URL counts as 23.
- Image upload uses `POST /2/media/upload` (`media_category=tweet_image`). Video is not supported yet.
