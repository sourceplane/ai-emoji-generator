# web-tests

The site's tests (the emojis and their full-text search on real SQLite with the migrations applied, the webhook signature and token checks, the rate limit, the images, Replicate not connected, the health route, the Worker-secrets push), run on every pull request

The test suite for **web**. It deploys nothing: its lane installs, builds and runs the tests.

|              |                      |
| ------------ | -------------------- |
| Type         | `turbo-package`      |
| Source       | `tests/web`          |
| Package      | `@app/web-tests`     |
| Environments | `dev`: `quick-check` |

## Depends on

- (none)

## Depended on by

- (none)
