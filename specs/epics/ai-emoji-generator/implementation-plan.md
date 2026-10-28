# ai-emoji-generator — implementation plan

## EM0 — the spec (EM-1)

The repository is born with turso-starter's intent, CI, tooling and spec
index, renamed; this doc set and the three task contracts land on top.

## EM1 — the emoji generator on Workers, D1, R2 and KV (EM-2)

1. The template (at `9e6c3f0`) into `apps/web/src`, a pnpm workspace
   package; Next.js 13.5 → 16.3.8 and React 19 (`useActionState`, awaited
   params, `next/og`), the dependencies React 19 needs bumped.
2. OpenNext: standalone output, the static-assets incremental cache,
   `images.unoptimized`, webpack; no `runtime = "edge"`; Inter self-hosted.
3. The emojis as `packages/db` migrations (`010_emojis` with its FTS5 table,
   `020_app_secrets`); the queries on D1 as prepared statements, the
   related-emoji search on bm25.
4. The images on R2 (`IMAGES`) behind `/api/images/<key>`; the limit on KV
   (`RATE_LIMIT`); the R2 and KV Terraform roots and their wiring.
5. Replicate optional: the guard on the action and both webhooks, the
   form's notice, `/api/health`; the token as an optional Orun secret
   pushed to the Worker; the signing secret read from Replicate.
6. The webhooks verified: the Standard Webhooks signature with WebCrypto, a
   five-minute window, constant-time comparison, a per-emoji token; the
   origin per environment.
7. Tests: `tests/web` (the signature against the Standard Webhooks
   vector, forged and stale deliveries, the tokens, the queries and search
   over real SQLite with the migrations, the rate limit, the routes, the
   site seam, the secrets push), `tests/db` (the migrations through the
   runner).
8. The README: how it runs, connects Replicate, deploys, maps to Vercel.

## EM2 — a baseline (EM-3)

The card (one Cloudflare provider; Replicate connected after the build),
the build document (one landing, then the record), the identity and the
rename seam (`SITE_NAME`), the context pack, the deployment record probing
`/api/health`, and the baseline's tests: contract tiers, generated
component docs, the leak gate (the template's licence and the new runtime
files must ship), placement (the R2 and KV roots, the optional Replicate
ref, the token kept out of the build, the origin), the offline bootstrap,
and the e2e — the stage lanes in staged job trees, the migrations against a
stand-in D1 API, the Worker served with no Replicate account and against a
stand-in Replicate API that refuses any token but the account's and
delivers each prediction back signed. Then `baseline-v1`.
