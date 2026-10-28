# cloudflare-r2

Provisions the Cloudflare R2 bucket the emojis' images are kept in (stage and prod)

Terraform-managed infrastructure, planned and applied per environment by its CI lane.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Type         | `terraform`                                                                                          |
| Source       | `infra/terraform/cloudflare-r2`                                                                      |
| Environments | `stage`: `plan-only`, `apply` on a push to `main` · `prod`: `plan-only`, `apply` on a push to `main` |

## Depends on

- (none)

## Depended on by

- **web** — The AI emoji generator (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, per environment; its emojis in D1, their images in R2, its rate limit in KV, its models on Replicate)
