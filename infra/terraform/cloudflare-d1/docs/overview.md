# cloudflare-d1

Provisions the Cloudflare D1 database for stage and prod — the site's directory and session secret

Terraform-managed infrastructure, planned and applied per environment by its CI lane.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Type         | `terraform`                                                                                          |
| Source       | `infra/terraform/cloudflare-d1`                                                                      |
| Environments | `stage`: `plan-only`, `apply` on a push to `main` · `prod`: `plan-only`, `apply` on a push to `main` |

## Depends on

- (none)

## Depended on by

- **db-migrate** — Applies the directory's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases
- **web** — The AI emoji generator (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, per environment; its emojis in D1, their images in R2, its rate limit in KV, its models on Replicate)
