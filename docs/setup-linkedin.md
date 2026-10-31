# LinkedIn setup

OpenSocial posts to a **LinkedIn Page (organization) by default**, through the
**Community Management API** product. Posting as a **personal profile** is still
supported as an explicit option (`--as member`), through the self-serve "Share on
LinkedIn" product — but the two products cannot coexist on the same app (adding
Community Management API removes Share on LinkedIn / Sign In from that app), so
pick the product that matches how you plan to connect before creating the app.

## Posting as the page (default)

1. Open https://www.linkedin.com/developers/apps and create an app (or reuse one)
   associated with the LinkedIn Page you administer.
2. **Settings** tab → **Verify** the app against that page. Verification is required
   before Community Management API access is granted.
3. **Products** tab → request **Community Management API**. This product is
   reviewed by LinkedIn staff, not self-serve: it requires a registered company
   (CNPJ in Brazil) and review can take days. Do not also add Share on LinkedIn /
   Sign In with LinkedIn to this app — the two product sets are mutually exclusive.
4. **Auth** tab → "Authorized redirect URLs for your app" → add exactly
   `http://localhost:8976/callback` (LinkedIn accepts http for localhost).
5. Copy Client ID and Primary Client Secret into `~/.config/opensocial/config.json`:

   ```json
   { "linkedin": { "clientId": "...", "clientSecret": "..." } }
   ```

6. `opensocial connect linkedin` — the browser opens; authorize as an admin of the
   page. OpenSocial looks up the pages you administer and connects as that page.
   If you administer more than one page, pass `--org <id>` with the organization's
   numeric id (from its URN, e.g. `143109039` in `urn:li:organization:143109039`);
   without it, OpenSocial lists the pages you administer and asks you to pick one.
7. First post:

   ```bash
   opensocial post --to linkedin --text "hello from opensocial" --media ./card.jpg
   ```

## Posting as a personal profile (`--as member`)

This needs a **separate app** (or the same app before Community Management API was
added) with the self-serve **Share on LinkedIn** and **Sign In with LinkedIn using
OpenID Connect** products — the scopes `openid`, `profile` and `w_member_social`
appear under Auth once both are added.

```bash
opensocial connect linkedin --as member
```

The account is stored as `linkedin` in `accounts.json` with the member URN id.
Connecting again as the page (without `--as member`) replaces it.

## Notes

- `OPENSOCIAL_LINKEDIN_CLIENT_ID` / `OPENSOCIAL_LINKEDIN_CLIENT_SECRET` env vars override
  `clientId`/`clientSecret` from `config.json` — useful for CI.
- Access tokens last ~60 days. Refresh tokens are only issued to apps enrolled in the
  programmatic-refresh program; without one, run `opensocial connect linkedin` again
  (with the same `--as`/`--org` you used before) when posts start failing with 401.
- Text goes through LinkedIn's "little text format" escaping automatically (`()[]{}@#*_~<>|\`).
- Posts are created with `visibility: PUBLIC` on the main feed.
