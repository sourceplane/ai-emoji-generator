# ai-emoji-generator — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | The emojis are a D1 table read and written with prepared statements (`src/server/db.ts`, `get-emoji(s).ts`, `emojis.ts`) — not Prisma's D1 adapter, not Drizzle | The template's queries are five, and its related-emoji search was MySQL full-text (`@@fulltext`, `_relevance`), which Prisma cannot express on SQLite; plain SQL keeps the FTS5 query readable and adds nothing to the Worker | design.md §3 |
| 2 | Related emojis are an FTS5 index of the prompts (`emojis_fts`), ranked by bm25, filled out with the newest | The same "more like this" the template's MySQL full-text gave, on D1 | design.md §3 |
| 3 | The app writes the FTS row beside the emoji in one batch; there are no triggers | The migration runner splits a file on top-level `;`, which would cut a trigger's body apart | design.md §3, risk EM-D |
| 4 | Images are R2 objects behind `/api/images/<key>`, the database storing the key path | Vercel Blob's public URLs have no Cloudflare equivalent without a public bucket; the Worker serves them with immutable caching | design.md §4 |
| 5 | The rate limit is a KV counter per visitor per UTC day (`RATE_LIMIT_PER_DAY`, default 500) | The template's Upstash fixed window, on a binding Terraform provisions; approximate (KV is eventually consistent), which a daily abuse limit tolerates | design.md §5, risk EM-C |
| 6 | Replicate is optional: without `REPLICATE_API_TOKEN` the gallery serves, the form says how to connect, the action answers "not connected" and both webhooks 503 | A fresh product deploys and serves before its owner has a Replicate account; no request goes out with no key | design.md §6 |
| 7 | Replicate's token is an optional Orun secret, kept out of the build (`env -u`) and handed to the Worker as a Worker secret (`tooling/wire/worker-secrets.mjs`) | It is read at request time; no bundle, build cache or log holds it | design.md §6 |
| 8 | Every webhook is verified with Replicate's signature (Standard Webhooks: HMAC-SHA256 over `id.timestamp.body`, constant-time, five-minute window), and carries a per-emoji token, HMAC(API secret, `stage:id`) | The template put its API secret in plain text in the webhook URL; a signature proves Replicate sent it, the token that it is about that emoji at that stage | design.md §7 |
| 9 | The webhook signing secret is read from Replicate's API with the token (`REPLICATE_WEBHOOK_SECRET` wins), cached per token | One secret for the owner to store, not two | design.md §7 |
| 10 | The webhook URL is the environment's own origin, built in as `NEXT_PUBLIC_SITE_URL` (`SITE_URL` or the workers.dev URL) | Replicate delivers to that URL; the template used Vercel's per-deployment URL | design.md §7 |
| 11 | The API secret is generated once per database (`020_app_secrets`); an `API_SECRET` Worker secret wins | Nothing is typed at build | design.md §6 |
| 12 | No Workers AI default model | No Workers AI model draws an emoji with its background removed as the template's do; a keyless default would be a different product | design.md §6 |
| 13 | next-axiom, @vercel/analytics, the App Store badge, its middleware and its rewrites are dropped | Vercel services and the authors' own app; the brief bans AI Gateway, and nothing else needs them | IMPLEMENTATION-STATUS |
| 14 | `next build --webpack` on Next 16.3.8 | OpenNext 1.20.11 accepts 16.3; webpack's Worker is the smaller and the playbook's default | IMPLEMENTATION-STATUS |
| 15 | No route keeps the template's `runtime = "edge"` | OpenNext answers 500 on Edge-runtime routes | IMPLEMENTATION-STATUS |
| 16 | The schema is migrations (`packages/db`), applied by `infra/db-migrate` between the D1 apply and the Worker's deploy | The convergence's order then includes the schema | design.md §8 |
| 17 | `wrangler.jsonc` is rendered from the three roots' wiring documents per environment, and the fixture render is committed; dev renders the fixture | The deploy lane checks the config exists before the build; no root applies in dev | design.md §8 |
| 18 | One landing (`01-product`) then the record (`02-docs`); edges `mode: enforced` on main, advisory on a pull request | The plan, not a landing boundary, orders the database, bucket and namespace, the schema and the Worker | design.md §8 |
| 19 | The D1 apply and the migrations use a `d1-edit` key, the R2 apply an `r2-data` key; the KV root applies with the deploy token | The `workers-deploy` token covers Workers and KV but not D1 or R2 | design.md §8 |
| 20 | The smoke requires `</html>` on `/` and `"ok":true` from `/api/health` | Only a Worker that read its migrated database answers the health route; read-only, and true with or without Replicate | IMPLEMENTATION-STATUS |
| 21 | The migrations package is named `@saas/db` | stack-tectonic's db-migrate composition builds `--filter=@saas/db` | turso-starter's shape |
| 22 | Component docs are generated from the manifests and checked in CI | A hand-written copy of the dependency graph, bindings and migrations drifts silently | `tooling/catalog/gen-component-docs.py` |
