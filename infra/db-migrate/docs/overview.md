# db-migrate

Applies the directory's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases

Applies this repository's ordered database migrations per environment: plan on pull requests, apply on merge to `main`.

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Type         | `db-migrate`                                                                               |
| Source       | `infra/db-migrate`                                                                         |
| Environments | `stage`: `plan`, `apply` on a push to `main` · `prod`: `plan`, `apply` on a push to `main` |

## Depends on

- **db** — The directory (users, organizations, memberships) and the session secret as migrations, and the runner that applies them to D1 (built by the db-migrate component before it plans or applies)
- **cloudflare-d1** — Provisions the Cloudflare D1 database for stage and prod — the site's directory and session secret

## Depended on by

- **web** — The AI emoji generator (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, per environment; its emojis in D1, their images in R2, its rate limit in KV, its models on Replicate)
