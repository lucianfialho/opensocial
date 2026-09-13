# Instagram setup

Instagram publishing uses the Instagram Graph API ("Instagram API with Instagram Login"),
which only works with **business or creator accounts**, and only through an app you
register yourself. There is no shared OpenSocial app — you bring your own credentials.

Total time: ~30 minutes, no app review needed for personal use.

## 1. Convert your account to business or creator

In the Instagram app: Settings → Account type and tools → Switch to professional account.
Personal accounts cannot use the Graph API at all.

## 2. Create a Meta app

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) and create a new app.
2. Choose the **Business** app type.
3. In the app dashboard, add the **"Instagram API with Instagram Login"** product
   (not the older "Instagram Basic Display" or the Facebook Login for Business flow —
   this is the standalone Instagram Login product).

## 3. Configure the OAuth redirect

OpenSocial runs a local OAuth callback server on your machine during `opensocial connect`.
In the Instagram product settings, add this exact redirect URI:

```
http://localhost:8976/callback
```

## 4. Add yourself as an Instagram Tester

While the app is in **development mode**, only accounts explicitly added as testers can
authorize it — and this requires no Meta app review:

1. App dashboard → Instagram → API setup with Instagram login → Add Instagram testers.
2. Add your own Instagram username.
3. Accept the invite from within the Instagram app: Settings → Apps and websites → Tester invites.

Development mode + tester is sufficient for posting to your own account indefinitely. You
only need app review if you want other people's accounts to connect to your app.

## 5. Copy your App ID and Secret

App dashboard → App settings → Basic. Copy the **Instagram App ID** and **Instagram App
Secret** (these are the Instagram Login product's credentials, not the general Facebook
app ID) into `~/.config/opensocial/config.json`:

```json
{
  "instagram": {
    "clientId": "YOUR_INSTAGRAM_APP_ID",
    "clientSecret": "YOUR_INSTAGRAM_APP_SECRET"
  }
}
```

Alternatively, set `OPENSOCIAL_INSTAGRAM_CLIENT_ID` / `OPENSOCIAL_INSTAGRAM_CLIENT_SECRET`
env vars — these take precedence over the config file (useful for CI).

## 6. Connect

```bash
opensocial connect instagram
```

This opens a browser to authorize the app with scopes `instagram_business_basic` and
`instagram_business_content_publish`, then stores the resulting token in
`~/.config/opensocial/accounts.json`.

## Notes

- Instagram never accepts direct file uploads — every image/video is published from a
  **public URL** that Meta's servers fetch. If you're posting local files, you need a
  media host configured; see [docs/media-host.md](media-host.md).
- Long-lived tokens last ~60 days and OpenSocial refreshes them automatically on 401s
  during `opensocial post`. If a refresh fails, run `opensocial connect instagram` again.
