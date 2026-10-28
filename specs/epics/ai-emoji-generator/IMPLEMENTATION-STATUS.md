# ai-emoji-generator — implementation status

| Milestone | State | Landed |
|---|---|---|
| EM0 — the spec | ✅ | EM-1 |
| EM1 — the emoji generator on Workers, D1, R2 and KV | ✅ | EM-2 |
| EM2 — a baseline | ✅ | EM-3, tagged `baseline-v1` |

## Departures from the upstream template

Everything not listed here is the template as it is upstream at `9e6c3f0`.

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace (`@app/web`); bun → pnpm | turso-starter's shape |
| 2 | Next.js 13.5.2 → 16.3.8, React 19; `next build --webpack`; `output: "standalone"`, `images.unoptimized`; `useFormState` → `useActionState`, awaited `params`, `next/og` for the images, `onLoad` for the image fade; lucide-react, swr and react-hot-toast bumped to React 19 releases; `replicate` 0.18 → 1.4.0 | OpenNext 1.20.11's supported line; webpack is the smaller Worker |
| 3 | No route keeps `export const runtime = "edge"`; the global `fetch` no-store override is gone | OpenNext answers 500 on Edge-runtime routes; `force-dynamic` does the same job |
| 4 | Prisma + PlanetScale + Accelerate → prepared statements on D1 (`src/server/db.ts`), the schema as `010_emojis` | Five queries; Prisma's D1 adapter cannot express the full-text relevance on SQLite (design §3) |
| 5 | MySQL `@@fulltext` relevance → an FTS5 table `emojis_fts`, bm25, the prompt's words ORed; written by the app beside each emoji | D1's full-text search; the migration runner cannot carry a trigger (design §3) |
| 6 | Vercel Blob → the `IMAGES` R2 bucket, the row storing `/api/images/<key>`; `/api/images/[key]` added; the image routes read R2 directly | No public bucket (design §4) |
| 7 | Upstash sliding window over Vercel KV → a fixed daily KV counter (`RATE_LIMIT_PER_DAY`, default 500); the iOS limit and its JWT field dropped; the limit message is "Daily limit reached, try again tomorrow." (upstream: download the mobile app) | A binding Terraform provisions; the iOS app is the authors' own (design §5) |
| 8 | `API_SECRET` → generated per database (`020_app_secrets`), an `API_SECRET` Worker secret winning | Nothing typed at build |
| 9 | The webhooks verify Replicate's signature (WebCrypto, constant time, five-minute window) and a per-emoji token; `API_SECRET` is no longer in the webhook URL | The template's URL carried its one secret into every stored prediction (design §7) |
| 10 | The webhook origin is `NEXT_PUBLIC_SITE_URL` (`SITE_URL`, else the workers.dev URL), not `VERCEL_URL` | Replicate delivers to the environment's own origin |
| 11 | The emoji row is written before its prediction starts (upstream: both in `Promise.all`) | The first webhook must find the row |
| 12 | Replicate optional: `replicateConnected()`, the form's notice and disabled input, "not connected" from the action, 503 from both webhooks; the token as an optional Orun secret pushed to the Worker; `REPLICATE_API_BASE` (unset in a product) | A product serves before it has an account (design §6) |
| 13 | `app/api/health/route.ts` added | The deploy's smoke and the record's probe |
| 14 | `lib/site.ts` (`SITE_NAME`, `SOURCE_URL`, `siteUrl()`): the page heading, the header and the titles (upstream: "AI Emojis", "emojis"); the header's GitHub link points at the product's repository | One rename seam; the AGPL's source offer to visitors |
| 15 | Removed: next-axiom, `@vercel/analytics`, the App Store badge, `/app` middleware, the `/privacy` and `/terms` rewrites to the authors' API, their featured Open Graph images and Twitter handle | Vercel services and the authors' own app; no AI Gateway |
| 16 | `icon.tsx` (an Edge `ImageResponse`) → a static `icon.svg`; the per-emoji favicons and Open Graph images kept | The Edge runtime; the root icon needs no render |
| 17 | Inter self-hosted with `next/font/local` (`src/app/fonts`, OFL-1.1) | `next/font/google` fails on GitHub's runners |
| 18 | ESLint: the flat config of eslint-config-next 16 with `react-hooks/set-state-in-effect` off | `next lint` is gone in Next 16; the rule postdates the template's effects |
| 19 | `apps/web/LICENSE.md` is upstream's AGPL-3.0 text, and `package.json` says `AGPL-3.0-only` | The product carries it |
| 20 | `wrangler.template.jsonc` (D1, R2 and KV bindings), `component.yaml`, `cloudflare-env.d.ts`, `open-next.config.ts` | The Worker's config and the deploy contract replace Vercel's |

## Decisions the brief left open

| Question | Chosen |
|---|---|
| Prisma's D1 adapter or Drizzle | Neither: prepared statements (design §3) |
| KV or the Rate Limiting binding | KV (design §5) |
| A keyless Workers AI default | None (design §6) |
| next-axiom | Dropped |

## Verified

- `pnpm typecheck`, `lint`, `test` (tests/web 33, tests/db 14) and `build`
  green; the Worker is 1.89 MiB gzipped (Workers Free).
- Every Baseline CI tier passes locally, the end-to-end tier included: the
  site with no Replicate account, then against a stand-in Replicate API — a
  prompt generated through both signed webhooks, the images stored in R2,
  unsigned, foreign-key, stale and misdirected deliveries refused, the
  classifier's refusal, Replicate's failure and the daily limit.
