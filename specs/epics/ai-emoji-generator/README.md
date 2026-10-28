# ai-emoji-generator — Vercel's AI Emoji Generator on Cloudflare Workers, D1, R2 and KV

**The template turns a prompt into an emoji — a safety classifier, an SDXL
model fine-tuned on emojis and a background remover, all on Replicate,
chained by Replicate's webhooks — and keeps every emoji in a gallery with
related emojis by full-text search. The port runs it as one Cloudflare
Worker, moves PlanetScale to D1 (with FTS5 for the search), Vercel Blob to
R2 and Upstash to KV, makes Replicate optional so a fresh product serves
before it has an account, verifies every webhook it is sent — and the
baseline makes a copy of it somebody else's in one landing.**

| | |
|---|---|
| Status | ✅ Shipped (`baseline-v1`) — proven offline in Baseline CI; not yet live (risk EM-A) |
| Upstream | [pondorasti/emojis](https://github.com/pondorasti/emojis) (AGPL-3.0), at `9e6c3f0` (2023-10-19) |
| Reference | [turso-starter](https://github.com/sourceplane/turso-starter) — Next.js on OpenNext with D1, its migrations and bootstrap; [blob-starter](https://github.com/sourceplane/blob-starter) — an R2 root and a delivery route; [kv-redis-starter](https://github.com/sourceplane/kv-redis-starter) — a KV root |
| Key | `EM` |

## Read in this order

1. [design.md](design.md) — the template, how each Vercel piece maps to
   Cloudflare, the emojis on D1, the images on R2, the rate limit on KV,
   Replicate optional, the webhooks, the repository and the build, and the
   alternatives rejected.
2. [implementation-plan.md](implementation-plan.md) — the milestones and
   what each one lands.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from the upstream template.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| EM0 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | EM-1 |
| EM1 — the emoji generator on Workers, D1, R2 and KV | the template in `apps/web`, its emojis as migrations, the images on R2, the limit on KV, Replicate optional and its webhooks verified, its tests, the README | EM-2 |
| EM2 — a baseline | the console card, the build document, the context pack and the baseline's tests | EM-3 |
