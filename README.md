# ai-emoji-generator

The [AI Emoji Generator](https://github.com/pondorasti/emojis) — Vercel's AI
Emoji Generator template: type a prompt and get an emoji, the prompt checked
by a safety classifier, drawn by an SDXL model fine-tuned on emojis, its
background removed, and every emoji kept in a gallery with related emojis
found by full-text search — running on **Cloudflare Workers + Static
Assets** through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).
The models run on **[Replicate](https://replicate.com)**, an account the
owner connects after the build. The emojis are in a **Cloudflare D1**
database, their images in an **R2** bucket and each visitor's daily limit in
a **Workers KV** namespace, all three provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun), the schema applied by
migrations, and packaged as an **Orun baseline**: one command takes a new
product from nothing to live on stage and prod, in its own repository, under
its own name — in ONE landing.

The template's Prisma/PlanetScale queries are D1 prepared statements now,
its MySQL full-text search an FTS5 index, its Vercel Blob images R2 objects
the Worker serves, and its Upstash rate limit a KV counter. Every webhook
Replicate delivers is verified by its signature, its age and a per-emoji
token before it is read. The site goes live with no Replicate account: the
gallery serves, and the form says how to connect one. What the baseline
adds is everything needed to make a copy of it somebody else's, built the
way [cirrus-baseline](https://github.com/sourceplane/cirrus-baseline) is.
See [`specs/epics/ai-emoji-generator`](specs/epics/ai-emoji-generator/README.md)
for the design, the milestones and the as-built status.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/ai-emoji-generator
cd ai-emoji-generator
orun new --blueprint repo-blueprint.yaml --out ~/sites/acme-emojis --run-hooks --resume \
  --set reponame=acme-emojis --set productname="Acme Emojis" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`ai-emoji-generator` → Build). Two phases: **`01-product`** creates the
repository and lands the whole product as ONE pull request — intent, CI,
tooling, the D1, R2 and KV roots, the migrations, the site and its tests —
and one convergence, per environment, applies the database, the bucket and
the namespace, then the migrations, then deploys the site bound to them; **`02-docs`** records the live deployment
from probed facts. **[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator guide;
[docs/phases/](docs/phases/README.md) has a page per phase.

The new repository receives the **product only** — the app, its D1, R2 and
KV roots, its migrations and their runner, its tests, its CI, its tooling, a README of its
own and its operating contract — renamed throughout to the product's name,
repository, Cloudflare Worker, database, bucket and namespace names. None of this repository's
machinery ships.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, and the bootstrap's task contracts | `.baseline/` |
| The rename engine | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's README and context pack | `.baseline/product/README.md`, `ai/context/` |
| The baseline's tests: contract, wiring, leak, offline bootstrap, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The pages: the generator and gallery, an emoji's page, the Open Graph images and favicons, the sitemap | `apps/web/src/app` |
| The generate form and its server action (rate limit, classifier, generation) | `apps/web/src/app/_components/emoji-form` |
| Replicate's client, and the "connect Replicate" state | `apps/web/src/server/replicate.ts` |
| Replicate's webhooks and their verification (signature, age, per-emoji token) | `apps/web/src/app/api/webhook`, `apps/web/src/server/webhook.ts` |
| The emojis on D1, and the related-emoji search (FTS5) | `apps/web/src/server/db.ts`, `get-emoji(s).ts`, `emojis.ts` |
| The images on R2, served by the Worker | `apps/web/src/server/images.ts`, `apps/web/src/app/api/images` |
| The daily limit on KV, the generated API secret | `apps/web/src/server/ratelimit.ts`, `apps/web/src/server/secrets.ts` |
| The site's name, source link and origin | `apps/web/src/lib/site.ts` |
| The health route the deploy smoke-tests | `apps/web/src/app/api/health/route.ts` |
| Workers build, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ the committed `wrangler.jsonc`), `component.yaml` |
| The D1 database, the R2 bucket, the KV namespace (stage, prod) | `infra/terraform/cloudflare-d1`, `cloudflare-r2`, `cloudflare-kv` |
| The schema (migrations) and the runner that applies them over the D1 REST API | `packages/db`, run by `infra/db-migrate` |
| The wrangler renderer, Replicate's token to the Worker, the migration helpers | `tooling/wire`, `tooling/migrations` |
| Tests | `tests/web` (the webhook signature against the Standard Webhooks vector, forged and stale deliveries, the tokens, the queries and full-text search on real SQLite with the migrations applied, the rate limit, the images, the not-connected state, the health route, the secrets push), `tests/db` (the migrations through the runner, into real SQLite) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render apps/web/wrangler.jsonc from the offline fixture
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build --webpack + opennextjs-cloudflare build → apps/web/.open-next
```

```bash
pnpm --filter @app/web db:migrate:local   # the emojis and the API secret in wrangler's local D1
pnpm --filter @app/web dev                # http://localhost:3000 — local D1, R2 and KV through wrangler's platform proxy
pnpm --filter @app/web preview            # wrangler dev over the built Worker, the same local bindings
```

## How it maps to Vercel

| Vercel-side | Here |
|---|---|
| Next.js 13.5 hosting, server actions, Edge routes | Next.js 16.3 in one Cloudflare Worker (`.open-next/worker.js`) + Static Assets, built with webpack; no route keeps `runtime = "edge"` (OpenNext answers 500 on it) |
| PlanetScale (MySQL) through Prisma; `@@fulltext` relevance for related emojis | D1 through prepared statements (`010_emojis`); an FTS5 index of the prompts, ranked by bm25 |
| Vercel Blob (public URLs) | An R2 bucket, private, served by `/api/images/<key>` with immutable caching |
| Upstash Ratelimit (Redis) | A KV counter per visitor per UTC day (`RATE_LIMIT_PER_DAY`, default 500) |
| `REPLICATE_API_TOKEN` (required) | The product's optional Orun secret, handed to the Worker as a Worker secret on deploy; without it the site serves with a "connect Replicate" form |
| `API_SECRET` in the environment, sent in plain text in the webhook URL | A secret generated once per database (`020_app_secrets`; an `API_SECRET` Worker secret wins); each webhook URL carries a per-emoji HMAC token instead, and each delivery is checked against Replicate's signature |
| The webhook URL from `VERCEL_URL` | The environment's own origin, built in (`SITE_URL`, or the workers.dev URL) |
| next-axiom, `@vercel/analytics`, the App Store badge and its middleware | Removed |
| Deploy on push | Orun applies the database, bucket and namespace, migrates and deploys `<repo>-web-{stage,prod}` on merge to `main` |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, deployed |

## How the bindings reach the Worker

```
infra/terraform/cloudflare-d1 ──apply──► orun secret WIRING_CLOUDFLARE_D1 (stage, prod)
infra/terraform/cloudflare-r2 ──apply──► orun secret WIRING_CLOUDFLARE_R2
infra/terraform/cloudflare-kv ──apply──► orun secret WIRING_CLOUDFLARE_KV
                                               │   (the landing's await checks they exist)
                                               ▼
infra/db-migrate  dependsOn cloudflare-d1 (enforced on main) · secretEnv WIRING_CLOUDFLARE_D1
  apply:  packages/db's runner → POST …/d1/database/<id>/query, each pending migration once
                                               ▼
apps/web  dependsOn cloudflare-d1, -r2, -kv + db-migrate (enforced on main) · secretEnv WIRING_CLOUDFLARE_*_<ENV>
  build:  tooling/wire/live.mjs → wrangler.jsonc with the environment's database, bucket and namespace
          (dev, verify-only, renders the fixture) → next build --webpack for the environment's origin
          → opennextjs-cloudflare → tooling/wire/worker-secrets.mjs: Replicate's token, when the
            environment has one, to the Worker as a Worker secret
```

`wrangler.jsonc` is committed as the fixture render of
`wrangler.template.jsonc`, because the deploy lane's `verify-app-structure`
step checks the config exists before it builds; `testing/e2e.test.sh` fails
if the two disagree.

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (packages type-checked, linted, tested and built, both test suites, the site built and dry-deployed per environment), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone is the check; a merge applies the D1 database, the bucket and the namespace, migrates, then deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
| `baseline.yml` | the baseline's own tiers: contract tests, the wiring path, the blueprint read by the pinned orun, the leak gate, the offline bootstrap with the product's own plan, the product built in the job tree, migrated, dry-deployed and served — with no Replicate account, then against a stand-in Replicate API that delivers signed webhooks | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |
