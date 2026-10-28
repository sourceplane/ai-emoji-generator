# web

The AI emoji generator (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, per environment; its emojis in D1, their images in R2, its rate limit in KV, its models on Replicate)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- **cloudflare-d1** — Provisions the Cloudflare D1 database for stage and prod — the site's directory and session secret
- **cloudflare-r2** — Provisions the Cloudflare R2 bucket the emojis' images are kept in (stage and prod)
- **cloudflare-kv** — Provisions the Cloudflare KV namespace the daily rate limit is counted in (stage and prod)
- **db-migrate** — Applies the directory's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases

## Depended on by

- (none)
