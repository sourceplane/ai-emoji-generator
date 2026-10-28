# ai-emoji-generator

The [AI Emoji Generator](https://github.com/pondorasti/emojis) — type a
prompt, get an emoji: the prompt checked by a safety classifier, drawn by an
SDXL model fine-tuned on emojis, its background removed, and the result added
to a gallery of every emoji made, with related emojis found by full-text
search — on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The models run
on **[Replicate](https://replicate.com)** (an account you connect after the
build). The emojis live in a **Cloudflare D1** database, their images in an
**R2** bucket and each visitor's daily limit in a **Workers KV** namespace,
all three provisioned per environment by Terraform, the schema applied by
migrations before every deploy.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace, whether Replicate is connected and the secrets the site uses
into [ai/context/deployment.md](ai/context/deployment.md); how the site
deploys and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## Connecting Replicate

The site deploys and serves before any Replicate account is connected: the
gallery is there (empty on a new site) and the generate form says how to
connect one. To connect it:

1. **Create an API token** at
   [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
   (`r8_…`). Each emoji runs three models on your account — the prompt
   classifier, the emoji model and the background remover — billed by
   Replicate.
2. **Give the site its token**, once per deployed environment. It is this
   repository's Orun secret, and stage and prod can each use their own:

   ```bash
   orun secrets set REPLICATE_API_TOKEN --env stage   # prompts for the value
   orun secrets set REPLICATE_API_TOKEN --env prod
   ```

   The build never sees it; the deploy hands it to the Worker as a Worker
   secret (`wrangler secret bulk`), so it is in no bundle, no build cache and
   no log. Replicate's webhook signing secret needs no step of its own: the
   Worker reads it from Replicate's API with the token.
3. **Redeploy the site**: a secret reaches the Worker when the site deploys,
   and setting one deploys nothing. Use **Deploy by hand** below, or change
   the stamp on the last line of `apps/web/component.yaml`
   (`# orun: redeploy …`) and merge. From that deploy on, the form generates
   and `/api/health` reports `"replicate":"connected"`.

Replicate delivers each finished prediction to the site
(`/api/webhook/remove-background`, then `/api/webhook/save-emoji`), so the
site must be reachable at its environment's origin — its workers.dev URL, or
`SITE_URL` once it has a domain (below). A delivery is accepted only when
Replicate's signature checks out, it is less than five minutes old and it
carries the token the site minted for that emoji; anything else is refused
before it is read.

Each visitor may start 500 generations a UTC day (the template's free limit),
counted in KV. Set a Worker variable `RATE_LIMIT_PER_DAY` to change it.

## What is here

| Surface | Where |
|---|---|
| The pages: the generator and gallery, an emoji's page, the Open Graph images and favicons | `apps/web/src/app` |
| The generate form and its server action (rate limit, classifier, generation) | `apps/web/src/app/_components/emoji-form` |
| Replicate's client, and the "connect Replicate" state | `apps/web/src/server/replicate.ts` |
| Replicate's webhooks and their verification | `apps/web/src/app/api/webhook`, `apps/web/src/server/webhook.ts` |
| The emojis on D1 (reads, writes, related-emoji search) | `apps/web/src/server/db.ts`, `get-emoji(s).ts`, `emojis.ts` |
| The images on R2, served by the Worker | `apps/web/src/server/images.ts`, `apps/web/src/app/api/images` |
| The daily limit on KV; the generated API secret | `apps/web/src/server/ratelimit.ts`, `apps/web/src/server/secrets.ts` |
| The site's name and source link, and its origin | `apps/web/src/lib/site.ts` |
| The health route the deploy smoke-tests | `apps/web/src/app/api/health/route.ts` |
| Workers build, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ `wrangler.jsonc`), `component.yaml` |
| The D1 database, the R2 bucket and the KV namespace (stage, prod) | `infra/terraform/cloudflare-d1`, `infra/terraform/cloudflare-r2`, `infra/terraform/cloudflare-kv` |
| The schema (migrations) and their runner | `packages/db`, applied by `infra/db-migrate` |
| Handing Replicate's token to the Worker | `tooling/wire/worker-secrets.mjs` |
| Tests | `tests/web`, `tests/db` (vitest) |

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

To generate locally, put your token in `apps/web/.dev.vars`
(`REPLICATE_API_TOKEN=r8_…`, for `wrangler dev`) or `.env.local` (for
`next dev`) — never commit it — and build with `NEXT_PUBLIC_SITE_URL` set to a
public tunnel to your machine, so Replicate can deliver its webhooks.

Make the site yours in `apps/web/src`, and its name and the repository it
links to in `apps/web/src/lib/site.ts`.

## How the bindings are wired

The Worker binds the database as `DB`, the bucket as `IMAGES` and the
namespace as `RATE_LIMIT`. None of their ids or names is hand-written:
`apps/web/wrangler.template.jsonc` names them as wiring tokens, and
`wrangler.jsonc` is that template rendered — from `wiring.fixture.json`
(placeholders) for local work and verification, and on every deploy from the
documents the `cloudflare-d1`, `cloudflare-r2` and `cloudflare-kv` Terraform
roots publish after their applies (`WIRING_CLOUDFLARE_D1`, `_R2`, `_KV`, per
environment). Edit the template, then `pnpm run wire:fixture` and commit the
render with the template.

The schema is `packages/db`'s migrations: each
`src/migrations/<NNN>_<name>/up.sql` is listed in `src/manifest.ts` with its
checksum, and the `db-migrate` component applies the pending ones to each
environment's database before the site deploys. To change the schema, add a
migration (never edit an applied one — its checksum is recorded), then
`pnpm --filter @saas/db run manifest:fix`. Locally,
`pnpm --filter @app/web db:migrate:local` applies the same files to
wrangler's local D1.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment, the D1 database, the
R2 bucket and the KV namespace apply first, then the migrations, then the
site builds with that environment's bindings and origin, hands it Replicate's
token (when the environment has one) and deploys — to `stage`, then to
`prod` once stage has converged on the same commit; `dev` only verifies. The
Worker is `ai-emoji-generator-web-<env>` on your account's workers.dev
subdomain, and every deploy is smoke-tested over HTTP: the home page must
render to its end, and `/api/health` must answer ok — which only a Worker
that read its database can. A pull request runs the same pipeline's verify
lanes: the packages type-checked, linted, tested and built, both test suites,
and the site built and dry-deployed for each environment, with nothing
deployed. (A push to `main` applies, migrates, builds and deploys.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens (one to deploy and apply the namespace, one scoped to D1,
one to R2) and the account id are brokered per run from the workspace's
Cloudflare connection, the binding ids travel as Orun secrets, and
Replicate's token is the product's own Orun secret; nothing provider-shaped
is stored in the repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after storing
Replicate's token, say. A component with nothing to run in that environment
(a test suite in `prod`) is left out with a notice.

## Custom domain

The site answers on workers.dev from its first deploy. To serve it on your
own domain:

1. Add the domain to the Cloudflare account the site deploys into, and attach
   it to the Worker (dashboard → Workers & Pages →
   `ai-emoji-generator-web-prod` → Settings → Domains & Routes → Add →
   Custom domain).
2. Set the environment's public origin in `intent.yaml`, so the next deploy
   builds the site for it — the webhooks Replicate delivers, the sitemap and
   the Open Graph links (until then they use the workers.dev URL):

   ```yaml
   environments:
     prod:
       env:
         SITE_URL: https://ai-emoji-generator.example.com
   ```

   The site was born with the reserved placeholder
   `ai-emoji-generator.example.com` where its domain goes: that example, and
   `BASE_DOMAIN` under each environment in `intent.yaml`. Replace it with
   your domain in the same change, and land it with a change under
   `apps/web` so the merge rebuilds the site.

## Credits

The app is the AI Emoji Generator by Alexandru Ţurcanu and Dylan Player
([pondorasti/emojis](https://github.com/pondorasti/emojis), AGPL-3.0 —
`apps/web/LICENSE.md`). As the AGPL asks, a site built from it offers its
visitors its source: the header links this repository, which is public by
choice, not by default — keep a link to the site's source reachable if you
change either. The models are [fofr/sdxl-emoji](https://replicate.com/fofr/sdxl-emoji),
[fofr/prompt-classifier](https://replicate.com/fofr/prompt-classifier) and
[cjwbw/rembg](https://replicate.com/cjwbw/rembg) on Replicate. Inter is
self-hosted from `@fontsource-variable/inter` (OFL-1.1 —
`apps/web/src/app/fonts/Inter-OFL.txt`).
