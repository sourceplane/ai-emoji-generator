# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`ai-emoji-generator/`](./ai-emoji-generator/) | **EM** | In progress (EM1: the site on Workers) | Vercel's AI Emoji Generator — a prompt in, an emoji out, and a gallery of every emoji made — on Cloudflare Workers with its emojis in D1, their images in R2, its rate limit in KV and its models on Replicate, and an Orun baseline that instantiates it in one landing (EM2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
