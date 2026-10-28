# ai-emoji-generator — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/ai-emoji-generator/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| EM-A | Not yet proven live: the `d1-edit` and `r2-data` mints, the three Terraform applies and their wiring publishes, the migrations against the real D1 API, the deploy, the Worker-secret push and the workers.dev probes | OPEN | One bootstrap from a tag against a workspace whose Cloudflare token can mint D1 Edit and R2 |
| EM-B | Replicate itself is unproven here: the three model versions, their output shapes and the signed deliveries were exercised only against a stand-in API built from Replicate's documentation | OPEN | Connect a Replicate account to a bootstrapped product and generate an emoji |

Accepted, and worth knowing before you change them: EM-C (the daily limit
is a KV counter — eventually consistent, so a burst from one visitor across
locations can pass it by a little), EM-D (the full-text index is written by
the app, not by a trigger: an emoji inserted by hand needs its `emojis_fts`
row too), EM-E (the code is AGPL-3.0 — a site built from it must offer its
visitors its source; the header links it), EM-F (each generation is three
Replicate predictions billed to the owner's account; the daily limit and
the classifier are the only brakes).
