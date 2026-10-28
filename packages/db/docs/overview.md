# db

The directory (users, organizations, memberships) and the session secret as migrations, and the runner that applies them to D1 (built by the db-migrate component before it plans or applies)

A workspace package built by the turbo pipeline. It deploys nothing itself: its lane type-checks, lints, tests and builds it.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `packages/db`        |
| Package      | `@saas/db`           |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- **db-migrate** — Applies the directory's schema (packages/db's migrations) to the stage and prod Cloudflare D1 databases
