# ai-emoji-generator — risks and open questions

| ID | Risk | State | Notes |
|---|---|---|---|
| EM-A | `baseline-v1` is not yet proven live: the `d1-edit` and `r2-data` mints, the three applies and their wiring publishes, the migrations against the real D1 API, the deploy, the Worker-secret push and the workers.dev probes | OPEN | Proven offline in Baseline CI. One bootstrap from the tag closes it |
| EM-B | Replicate itself is unproven here: the three pinned model versions, their output shapes, the signing-secret endpoint and the signed deliveries | OPEN | Exercised against a stand-in built from Replicate's documentation, and the signature against the Standard Webhooks test vector; one generation on a connected product closes it. A model version Replicate retires breaks generation until its hash is updated |
| EM-C | The daily limit is a KV counter: eventually consistent, so a burst from one visitor across locations can pass it by a little | ACCEPTED | A daily abuse brake, not a quota; the Rate Limiting binding cannot count a day |
| EM-D | The full-text index is written by the app, not a trigger | ACCEPTED | An emoji inserted by hand needs its `emojis_fts` row too, or it is found only as "newest" |
| EM-E | The code is AGPL-3.0 | ACCEPTED | A site built from it must offer its users its source; the header links the product's repository. An owner who wants it closed needs the authors' permission |
| EM-F | Each generation is three Replicate predictions on the owner's account | ACCEPTED | The classifier and the daily limit are the only brakes, as upstream |
| EM-G | Replicate must reach the site's origin; a prediction whose webhook cannot be delivered leaves an unfinished emoji (a placeholder card, out of the gallery) | ACCEPTED | The origin is built in per environment; a new `SITE_URL` takes a redeploy |
| EM-H | Next.js 16 on OpenNext 1.20.11 | ACCEPTED | Pinned 16.3.8 (16.4.x fails on 1.20.11) |
| EM-I | A Replicate token removed from Orun stays on the Worker | ACCEPTED | The deploy pushes the secrets that exist and deletes none; `wrangler secret delete` removes one |
| EM-J | `REPLICATE_API_BASE` redirects the Replicate client | ACCEPTED | Unset in a product; a Worker variable only the owner sets. The offline tests use it |
