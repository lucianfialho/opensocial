# Media host

## Why this exists

Instagram's Graph API and TikTok's photo posts (`PULL_FROM_URL`) don't accept direct file
uploads. You give them an `image_url` / `video_url`, and their servers fetch it themselves.
If your media is a local file — not already hosted somewhere public — there's nothing to
point them at.

OpenSocial solves this by optionally uploading local files to an S3-compatible bucket you
control, publishing the resulting public URL, and deleting the file from the bucket once
the post is published (success or failure — cleanup runs either way).

This only applies when the target platform requires a public URL (`public-url` ingestion)
*and* you passed a local file path. If you pass a URL directly with `--media`, or the
platform accepts direct upload (TikTok video), the media host is never touched.

## Configuring a bucket

Any S3-compatible storage works: Cloudflare R2, AWS S3, MinIO, Backblaze B2, etc. Add a
`mediaHost` block to `~/.config/opensocial/config.json` with these six fields:

```json
{
  "mediaHost": {
    "endpoint": "https://<account-id>.r2.cloudflarestorage.com",
    "region": "auto",
    "bucket": "opensocial-media",
    "accessKeyId": "YOUR_ACCESS_KEY_ID",
    "secretAccessKey": "YOUR_SECRET_ACCESS_KEY",
    "publicBaseUrl": "https://media.yourdomain.com"
  }
}
```

| Field | Meaning |
|---|---|
| `endpoint` | The S3 API endpoint used to sign PUT/DELETE requests. |
| `region` | AWS region for signing (`auto` for R2, `us-east-1` etc. for AWS S3). |
| `bucket` | Bucket name objects are written to. |
| `accessKeyId` / `secretAccessKey` | Credentials with read/write/delete on that bucket. |
| `publicBaseUrl` | The public, internet-reachable base URL for objects in the bucket — this is what gets embedded in `image_url`/`video_url` and what Instagram/TikTok will fetch from. Must not require auth. |

For R2 and most self-hosted MinIO setups, `endpoint` (private, used for signed
upload/delete) and `publicBaseUrl` (public, used for the platform's fetch) are different
hosts — e.g. a custom domain or R2's public bucket URL in front of the bucket.

### Example: Cloudflare R2

1. Create a bucket, enable public access (custom domain or the `r2.dev` subdomain).
2. Create an API token with Object Read & Write scoped to the bucket.
3. `endpoint`: `https://<account-id>.r2.cloudflarestorage.com`
4. `publicBaseUrl`: your public domain/subdomain fronting the bucket.

### Example: MinIO (self-hosted)

1. `endpoint`: `https://minio.yourdomain.com` (must be reachable from Meta/TikTok's
   servers, not just your machine — a private/internal MinIO instance won't work here).
2. `publicBaseUrl`: same host, or a reverse proxy in front of it, with anonymous read
   enabled on the bucket/prefix you configure.

## What happens without a media host

If a platform needs a public URL, you pass a local file path, and no `mediaHost` is
configured, OpenSocial fails fast with a clear error before making any network calls —
it never falls back to a third-party temporary file host. Either pass a public URL
directly, or configure `mediaHost`.

## Lifecycle

Each local file uploaded for a post gets a unique key (`opensocial/<timestamp>-<filename>`).
After the post is published — or if publishing fails partway through — OpenSocial deletes
the uploaded object from the bucket as a best-effort cleanup step. Nothing is meant to be
retained in the bucket long-term; treat it as scratch space, not storage.
