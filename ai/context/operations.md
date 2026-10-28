# ai-emoji-generator — operating contract (for humans and agents)

This is the standing guide to how this site is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the site without any
other source.

## What this system is

The AI Emoji Generator — a prompt in, an emoji out: the prompt checked by a
safety classifier, drawn by an SDXL model fine-tuned on emojis, its
background removed, and the result added to a gallery with related emojis
found by full-text search — on Cloudflare, its models on Replicate,
expressed as an Orun component-native desired-state repo.

- **`infra/terraform/cloudflare-d1`** — one Cloudflare D1 database per
  deployed environment (`stage`, `prod`), applied by Terraform. After each
  apply it publishes a wiring document — `{d1_database_id, d1_database_name}`
  — as the Orun secret `WIRING_CLOUDFLARE_D1` on that environment.
- **`infra/terraform/cloudflare-r2`** — one R2 bucket per deployed
  environment, where the emojis' images are kept (private: the Worker serves
  them). After each apply it publishes `{r2_bucket_name}` as
  `WIRING_CLOUDFLARE_R2`.
- **`infra/terraform/cloudflare-kv`** — one Workers KV namespace per deployed
  environment, the visitors' daily generation counts. After each apply it
  publishes `{app_kv_id, app_kv_title}` as `WIRING_CLOUDFLARE_KV`.
- **`packages/db`** — the schema as migrations (`src/migrations/*/up.sql`,
  listed with their checksums in `src/manifest.ts`) and the runner that
  applies them to D1 over the REST API, recording each in a
  `_migrations_applied` table. `010_emojis` is the emojis table and the
  full-text index of their prompts (`emojis_fts`, FTS5); `020_app_secrets`
  generates the site's API secret once.
- **`infra/db-migrate`** — runs that runner per environment: it plans offline
  on a pull request and applies on a merge, finding the database through
  `WIRING_CLOUDFLARE_D1`.
- **`apps/web`** — the site: the template's Next.js app, built by
  `@opennextjs/cloudflare` into one Worker plus Static Assets. The generate
  form's server action checks the visitor's daily limit (KV), classifies the
  prompt and starts the emoji model on Replicate, which delivers the
  finished prediction to `/api/webhook/remove-background`; that stores the
  original in R2 and starts the background remover, whose delivery to
  `/api/webhook/save-emoji` stores the final image. `/api/images/<key>`
  serves the images from R2, and every page renders per request from D1.
- **`tests/web`**, **`tests/db`** — the webhook verification, the queries,
  the rate limit, the routes and the migrations applied through the runner
  into real SQLite (vitest), verified on the `dev` rung.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the wrangler
  renderer that turns `wrangler.template.jsonc` plus the wiring documents
  into `wrangler.jsonc`, the Worker-secrets push and the migration helpers.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys, and no
database, bucket or namespace exists for it (its build renders the committed
fixture).

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. **The database, bucket and namespace, then the schema, then the Worker**,
   per environment. `cloudflare-d1`, `cloudflare-r2` and `cloudflare-kv`
   apply and publish their wiring documents. `db-migrate` declares an
   enforced `dependsOn` on `cloudflare-d1` for pushes to `main`, so it starts
   after that apply — a job resolves its secrets when it starts, so the
   document is there — and applies every pending migration. `apps/web` waits
   on all four the same way.
4. `apps/web` renders `wrangler.jsonc` from those documents (the real
   database id, bucket name and namespace id), builds once per environment
   with `NEXT_PUBLIC_SITE_URL` set to that environment's `SITE_URL`
   (intent.yaml) or its workers.dev URL and no Replicate token in its
   environment, hands the environment's Replicate token (when it has one) to
   the Worker as a Worker secret, `wrangler deploy` ships
   `ai-emoji-generator-web-<env>`, and a smoke test requires `/` to render to
   its end and `/api/health` to answer `"ok":true` — which only a Worker that
   read the migrated `emojis` table can.
5. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
6. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing applies or deploys: the three roots plan, the
migrations plan offline (their checksums verified), the site builds and
dry-deploys, and the edges in step 3 are advisory.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "site
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.
- `wrangler.jsonc` is generated. Edit `wrangler.template.jsonc`, run
  `pnpm run wire:fixture` and commit both; the deploy renders its own
  config from the template, so a stale committed render misleads local work.
- An applied migration is immutable: its checksum is recorded, and the
  runner refuses to run while a file no longer matches it. Change the
  schema with a NEW migration.
- Replicate must reach the site to finish an emoji: a generation started on
  an environment whose origin Replicate cannot reach stays unfinished (its
  card shows a placeholder). The origin is built in, so a new `SITE_URL`
  takes a redeploy.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  Cloudflare connection — no long-lived values at rest, nothing to rotate by
  hand:
  - `CLOUDFLARE_API_TOKEN` (`workers-deploy`: Workers Scripts and KV) — the
    site's deploy and the KV root's apply;
  - `CLOUDFLARE_D1_TOKEN` (`d1-edit`: D1) — the D1 root's apply and the
    migration runner, which bind it as their `CLOUDFLARE_API_TOKEN`; the
    deploy token cannot touch D1;
  - `CLOUDFLARE_R2_TOKEN` (`r2-data`: R2) — the R2 root's apply;
  - `CLOUDFLARE_ACCOUNT_ID` — a connection fact all of them bind.
- **Wiring**: `WIRING_CLOUDFLARE_D1`, `WIRING_CLOUDFLARE_R2` and
  `WIRING_CLOUDFLARE_KV` on `stage` and `prod`, written by the roots' applies
  (lease-published), read by the migration runner and by the Worker's build
  as `WIRING_CLOUDFLARE_*_<ENV>`. They hold ids and names, not credentials.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.
- **The product's own secret** (optional, best-effort: a key nobody has
  stored is skipped and the site serves without it): `REPLICATE_API_TOKEN`,
  per environment — `orun secrets set REPLICATE_API_TOKEN --env <env>`, then
  redeploy. The deploy pushes it to the Worker with `wrangler secret bulk`
  and deletes none: a token you remove from Orun stays on the Worker until
  `wrangler secret delete`. Replicate's webhook signing secret is read from
  Replicate's API with that token (a `REPLICATE_WEBHOOK_SECRET` Worker secret
  wins).
- **The API secret** — what the generate form's short-lived rate-limit tokens
  and the webhooks' per-emoji tokens are signed with — is generated once per
  database by `020_app_secrets` (table `app_secrets`) and read by the Worker
  from D1; an `API_SECRET` Worker secret wins. Rotating it invalidates the
  webhooks of emojis still generating.

## Verifying the system

```bash
# the site on each environment (also recorded, probed, in deployment.md);
# the health route reads D1 and says whether Replicate is connected
curl -s https://ai-emoji-generator-web-stage.your-workers-subdomain.workers.dev/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://ai-emoji-generator-web-prod.your-workers-subdomain.workers.dev/

# the wiring the migrations and deploys read, and workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| change the site | edit `apps/web/src/` (its name and source link: `apps/web/src/lib/site.ts`), merge |
| connect Replicate | `orun secrets set REPLICATE_API_TOKEN --env stage` (and `prod`), redeploy — README, "Connecting Replicate" |
| change the daily limit | a Worker variable `RATE_LIMIT_PER_DAY` (default 500 per visitor per UTC day) |
| hide an emoji | `wrangler d1 execute <name> --remote --command "UPDATE emojis SET is_flagged = 1 WHERE id = '<id>'"` — flagged emojis leave the gallery and the sitemap |
| change the schema | add `packages/db/src/migrations/<NNN>_<name>/up.sql` (idempotent: `IF NOT EXISTS`), list it in `src/manifest.ts`, `pnpm --filter @saas/db run manifest:fix`, merge — db-migrate applies it before the site redeploys |
| try the schema locally | `pnpm --filter @app/web db:migrate:local` applies every migration to wrangler's local D1 |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| query a live database | `wrangler d1 execute <name> --remote --command "SELECT count(*) FROM emojis"` (the name is in the environment's `WIRING_CLOUDFLARE_D1`) |
| add a binding | a Terraform root under `infra/terraform/` that publishes `WIRING_<ROOT>`, a token in `wrangler.template.jsonc`, its fixture entry, the root in the build's `--components`, the `WIRING_<ROOT>_<ENV>` secretEnv and an enforced `dependsOn` on it in `apps/web/component.yaml` |
| serve a custom domain | attach it to the Worker in Cloudflare and set `SITE_URL` for the environment in `intent.yaml` (README, "Custom domain"), then replace the placeholder `ai-emoji-generator.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it |
| add a runtime secret | `orun secrets set <KEY> --org <ws> --env <env>` |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

D1 has no interactive transactions and caps a database's size; the emojis
need neither (the images are R2's). Structural changes follow the same
contract that deployed the site: add a component under `apps/`, `infra/` or
`packages/` with a `component.yaml`, land it as a pull request, and the
convergence run applies it.
