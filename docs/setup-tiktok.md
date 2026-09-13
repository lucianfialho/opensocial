# TikTok setup

TikTok publishing uses the Content Posting API through an app you register yourself.
There is no shared OpenSocial app — you bring your own credentials.

## 1. Create a TikTok developer app

1. Go to [developers.tiktok.com](https://developers.tiktok.com), sign in, and create an app.
2. In the app's products, add:
   - **Login Kit** (OAuth)
   - **Content Posting API**

## 2. Configure the OAuth redirect

OpenSocial runs a local OAuth callback server on your machine during `opensocial connect`.
In Login Kit's settings, add this exact redirect URI:

```
http://localhost:8976/callback
```

## 3. Request scopes

Under Login Kit, enable these scopes for the app:

```
user.info.basic,video.publish
```

## 4. Copy your Client Key and Secret

App dashboard → Basic information. Copy the **Client key** and **Client secret** into
`~/.config/opensocial/config.json`:

```json
{
  "tiktok": {
    "clientId": "YOUR_CLIENT_KEY",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "privacyLevel": "SELF_ONLY"
  }
}
```

Alternatively, set `OPENSOCIAL_TIKTOK_CLIENT_ID` / `OPENSOCIAL_TIKTOK_CLIENT_SECRET`
env vars — these take precedence over the config file (useful for CI).

## 5. Connect

```bash
opensocial connect tiktok
```

This opens a browser to authorize the app, then stores the resulting access + refresh
tokens in `~/.config/opensocial/accounts.json`.

## About SELF_ONLY visibility

TikTok apps start **unaudited**. Until the Content Posting API portion of your app passes
TikTok's audit, every post you publish through it is forced to `SELF_ONLY` visibility —
visible only to the account that posted it, regardless of what `privacyLevel` you set.

This is intentional and lets you build and test the full publish flow immediately. To post
publicly:

1. In the TikTok developer dashboard, submit the app for **Content Posting API audit**
   (App review → apply for the scope/product).
2. TikTok reviews how your app uses the posting API — expect to describe your use case and
   possibly demo the flow. This can take from a few days to a few weeks.
3. Once approved, set `"privacyLevel"` in `config.json` to one of TikTok's public values
   (e.g. `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, subject to
   what the account's own privacy settings allow) — OpenSocial passes it straight through
   as `post_info.privacy_level`. Omit it and OpenSocial defaults to `SELF_ONLY`.

## Notes

- Video posts are uploaded directly (`FILE_UPLOAD`), up to 64MB in v1 (single chunk —
  larger files fail validation with a clear error before any network call).
- Photo posts are published via **public URL** (`PULL_FROM_URL`) — TikTok's servers fetch
  the images, the same constraint Instagram has. If you're posting local image files, you
  need a media host configured; see [docs/media-host.md](media-host.md).
- Access tokens are short-lived; OpenSocial refreshes them automatically on 401s during
  `opensocial post`. If a refresh fails, run `opensocial connect tiktok` again.
