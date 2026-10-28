# web — architecture

Built by the turbo pipeline from `apps/web` and deployed with wrangler.

|                     |                                                 |
| ------------------- | ----------------------------------------------- |
| Worker config       | `apps/web/wrangler.template.jsonc`              |
| Entry               | `.open-next/worker.js`                          |
| Compatibility date  | `2026-10-01`                                    |
| Compatibility flags | `nodejs_compat`, `global_fetch_strictly_public` |

## Bindings

| Binding      | Kind                 | Source                                |
| ------------ | -------------------- | ------------------------------------- |
| `RATE_LIMIT` | Workers KV namespace | `app_kv_id` from `cloudflare-kv`      |
| `IMAGES`     | R2 bucket            | `r2_bucket_name` from `cloudflare-r2` |
| `DB`         | D1 database          | `d1_database_id` from `cloudflare-d1` |
| `ASSETS`     | Static assets        | `.open-next/assets`                   |

Identifiers marked _from_ a component are filled in at deploy time from
that component's published outputs for the environment being deployed.

## Wiring

Resolved at deploy time from secrets the infrastructure lanes publish (names only):

- `WIRING_CLOUDFLARE_D1_PROD`
- `WIRING_CLOUDFLARE_D1_STAGE`
- `WIRING_CLOUDFLARE_KV_PROD`
- `WIRING_CLOUDFLARE_KV_STAGE`
- `WIRING_CLOUDFLARE_R2_PROD`
- `WIRING_CLOUDFLARE_R2_STAGE`

## Secrets resolved by the lane (names only)

- `REPLICATE_API_TOKEN` (optional)
