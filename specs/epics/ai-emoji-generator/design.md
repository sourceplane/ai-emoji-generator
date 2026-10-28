# ai-emoji-generator — design

## 1. The template

The AI Emoji Generator (pondorasti/emojis, listed by Vercel as a template)
is a Next.js 13.5 app: one page with a prompt form and a gallery of every
emoji made, a page per emoji with the emojis related to it, Open Graph images
and favicons drawn from the emoji, and a sitemap. The form's server action
verifies a short-lived JWT the page fetched (`/api/token`, the visitor's
IP), applies an Upstash sliding-window limit (500 a day), asks Replicate's
`fofr/prompt-classifier` to rate the prompt's toxicity (9 or more: the emoji
is stored flagged and the visitor told to keep it PG), then stores the
emoji in PlanetScale through Prisma and starts `fofr/sdxl-emoji` on
Replicate with a webhook. That webhook (`/api/webhook/remove-background`)
stores the image in Vercel Blob and starts `cjwbw/rembg` with a second
webhook (`/api/webhook/save-emoji`), which stores the background-removed
image. Related emojis are MySQL full-text relevance over the prompts
(`@@fulltext`, Prisma's `_relevance`), cached by Prisma Accelerate.

## 2. How each piece maps

| Vercel-side | Here |
|---|---|
| Next.js 13.5 hosting, server actions, Edge routes | `@opennextjs/cloudflare` → one Worker + Static Assets, Next.js 16.3.8, built with webpack; every route on the Node.js runtime |
| PlanetScale (MySQL) through Prisma + Accelerate | D1 through prepared statements (`010_emojis`) |
| `@@fulltext` relevance | an FTS5 table `emojis_fts`, ranked by bm25 |
| Vercel Blob (public URLs) | an R2 bucket (private), served by `/api/images/<key>` |
| Upstash Ratelimit over Vercel KV | a KV counter per visitor per UTC day |
| `API_SECRET` in the environment | generated once per database (`020_app_secrets`) |
| `REPLICATE_API_TOKEN` required | an optional Orun secret, a Worker secret at request time |
| webhooks carrying `API_SECRET` in the URL | Replicate's signature + a per-emoji token |
| `VERCEL_URL` for the webhook URL | the environment's origin, built in (`NEXT_PUBLIC_SITE_URL`) |
| next-axiom, `@vercel/analytics` | removed |
| `next/font/google` | Inter self-hosted (`next/font/local`) |

## 3. The emojis on D1

`010_emojis` is the template's Prisma model as a table — id, timestamps,
prompt, the flags, the two image paths, the safety rating, an error — with
the template's index on the validity filter and one on `created_at`. The
reads (`get-emoji.ts`, `get-emojis.ts`, `get-emojis-count.ts`) and writes
(`emojis.ts`) are prepared statements on the `DB` binding: five queries do
not need an ORM, and Prisma's D1 adapter cannot express the one that
matters, the full-text relevance, on SQLite. Drizzle could, but only as raw
SQL; plain statements keep the Worker smaller and the query readable.

Related emojis: `emojis_fts` is an FTS5 table of `(id, prompt)`. The page's
prompt becomes an OR of its quoted words, the matches are ordered by bm25,
and the list is filled out with the newest emojis (deduplicated) — the
template's "relevance, then everything" order. The app writes the FTS row
in the same batch as the emoji, because the migration runner splits a file
on top-level semicolons and a trigger's body would be cut apart.

## 4. The images on R2

The webhooks fetch Replicate's output and `put` it into the `IMAGES` bucket
as `<id>-original.png` and `<id>-no-background.png`; the row stores the
path `/api/images/<key>`. The delivery route accepts only keys of that
shape and streams the object with an immutable cache header. The Open Graph
and favicon routes read the image from R2 into a data URL, so nothing
fetches the site's own origin from inside the Worker.

## 5. The rate limit on KV

`limit(ip)` reads and writes `ratelimit:<UTC day>:<ip>` in the
`RATE_LIMIT` namespace with a two-day TTL: a fixed daily window at
`RATE_LIMIT_PER_DAY` (default 500, the template's free limit). KV is
eventually consistent, so the count is approximate under a concurrent burst
from one visitor — acceptable for a daily abuse brake (risk EM-C). The
Rate Limiting binding was the alternative: it counts per location over
seconds-to-minutes windows, not a day, so it cannot say "500 a day".

## 6. Replicate optional

`replicateConnected()` is whether `REPLICATE_API_TOKEN` is set. Without it
the form renders disabled with a notice saying how to connect, the action
answers that before it does anything, both webhooks answer 503, and
`/api/health` reports `"replicate":"not-connected"`. So a fresh product
builds, deploys and passes its smoke with no account, and no request ever
leaves with no token. The token is the product's optional Orun secret
(`optionalSecretEnv`, best-effort): the build runs without it (`env -u`)
and `tooling/wire/worker-secrets.mjs` hands it to the Worker with
`wrangler secret bulk`. `REPLICATE_API_BASE` (unset in a product) points the
client at a stand-in for the offline tests.

The API secret that signs the page's JWT and the webhook tokens is
generated per database (`020_app_secrets`, 32 random bytes); an
`API_SECRET` Worker secret wins.

No Workers AI default: no Workers AI model draws an emoji and removes its
background the way the template's do, and a "default" that produced
something else would be a different product, not a keyless mode of this
one.

## 7. The webhooks

Replicate signs every delivery the Standard Webhooks way: `webhook-id`,
`webhook-timestamp` and `webhook-signature` (`v1,<base64>`, possibly
several), an HMAC-SHA256 over `<id>.<timestamp>.<body>` with the base64 key
after `whsec_`. `verifyReplicateWebhook` checks it with WebCrypto over the
body as sent, compares in constant time, and refuses a timestamp more than
five minutes from now. The signing secret is read from Replicate's API with
the token (`GET /v1/webhooks/default/secret`), cached per token; a
`REPLICATE_WEBHOOK_SECRET` Worker secret wins.

The template authenticated its webhooks with `API_SECRET` in the query
string — the site's one secret, written into every prediction Replicate
stores. Each webhook URL now carries a token of its own instead:
HMAC(API secret, `<stage>:<id>`), base64url, compared in constant time, so
a delivery is accepted only if Replicate signed it, it is fresh, and it is
for that emoji at that stage. The row is written before the prediction is
started, so the first delivery always finds it. The URL is the
environment's own origin, built in at build time (`SITE_URL`, else the
Worker's workers.dev URL).

## 8. The repository and the build

turso-starter's shape plus two roots: `apps/web`
(`cloudflare-workers-assets-turbo`), `infra/terraform/cloudflare-d1`,
`infra/terraform/cloudflare-r2` (blob-starter's root), `infra/terraform/cloudflare-kv`
(kv-redis-starter's root), `packages/db` + `infra/db-migrate`, `tests/web`,
`tests/db`. Per environment, on a merge: the three roots apply and publish
`WIRING_CLOUDFLARE_{D1,R2,KV}`, db-migrate applies the migrations, and the
site renders `wrangler.jsonc` from those documents, builds for the
environment's origin, pushes Replicate's token to the Worker and deploys;
`dev` only verifies. The D1 root and the migrations use a `d1-edit` key, the
R2 root an `r2-data` key, the KV root and the deploy the `workers-deploy`
key. The smoke requires `/` to render to its end and `/api/health` to answer
`"ok":true` — the route counts the emojis table, so only a Worker that read
its migrated database passes, with or without Replicate. One landing
(`01-product`), then the record (`02-docs`), which probes `/api/health` and
says whether Replicate is connected.

## 9. Alternatives rejected

- **Prisma with the D1 adapter.** The schema is one table, the full-text
  relevance cannot be expressed, and the client and its WASM engine would
  be most of the Worker.
- **FTS triggers.** The runner's statement splitter would break them; the
  app writes both rows in one batch instead.
- **A public R2 bucket.** It needs a domain or an r2.dev URL per bucket;
  the Worker already serves the site, so it serves the images too.
- **The Rate Limiting binding.** Its windows are seconds to a minute, per
  location; the template's limit is per day.
- **Keep `API_SECRET` in the webhook URL.** Replicate stores the URL with
  every prediction; the signature and a per-emoji token prove more and leak
  nothing reusable.
- **A Workers AI default model.** See §6.
