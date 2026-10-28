# ai-emoji-generator — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it;
the two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

The AI Emoji Generator (pondorasti/emojis, Vercel's AI Emoji Generator
template) — a prompt in, an emoji out: the prompt checked by a safety
classifier, drawn by an SDXL model fine-tuned on emojis, its background
removed, and every emoji kept in a gallery with related emojis found by
full-text search — on Cloudflare Workers + Static Assets, the emojis in a D1
database, their images in an R2 bucket and the daily rate limit in a Workers
KV namespace, all three provisioned by Terraform, the models on a Replicate
account the owner connects after the build. Packaged as an Orun baseline:
`orun new --blueprint repo-blueprint.yaml` builds a new product in its own
repository and takes it to live on stage and prod in one landing
(`01-product`: cloudflare-d1, cloudflare-r2, cloudflare-kv → db-migrate →
web per environment), then records what went live (`02-docs`).

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (EM0–EM2: the generator on Workers, its emojis on D1, R2 and KV, Replicate optional and its webhooks verified) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI: the migration lane against a stand-in D1 API, the built Worker served with no Replicate account and against a stand-in Replicate API that delivers signed webhooks. A live bootstrap from a tag is still to come (risk EM-A) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/ai-emoji-generator/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/ai-emoji-generator/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/ai-emoji-generator/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `<component>/docs/` beside each `component.yaml` — `apps/web`, `packages/db`, `infra/db-migrate`, `infra/terraform/cloudflare-{d1,r2,kv}`, `tests/{web,db}` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v1` against a workspace whose
   Cloudflare token can mint D1 Edit and R2 as well as Workers Scripts,
   connect a Replicate account, generate one emoji, and record the timings
   and the cost of a generation (closes EM-A, EM-B).
