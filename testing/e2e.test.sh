#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry)
# and serves.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges),
#      install with the lockfile the product ships, render the wrangler
#      fixture and check the committed config IS that render, typecheck,
#      lint, test, build. The landing's own PR runs `plan` alone (an
#      `orun/BASE-*` branch), so THIS is where a product those steps refuse
#      is caught: before the tag, not after a build has merged it;
#   2. the stage lanes' own steps, rendered by `orun plan` in the product and
#      run IN THE TREE THE RUNNER STAGES for each job (testing/lib/stage-job.py),
#      with the dependency layout the pinned composition produces and with the
#      job's secrets in its environment as the platform resolves them (the
#      component's secretEnv):
#      - web, from a pull request's plan (the verify profile: the deploy
#        profile has no dry run) — `verify-app-structure` (which checks the
#        wrangler config exists BEFORE anything is built), `build-app` (the
#        component's buildCommand: the live wiring render, then the build),
#        `verify-build-output` and `deploy-dry-run` (`wrangler deploy
#        --dry-run --name <reponame>-web-stage`), the database id, the bucket
#        and the namespace in the built config asserted to be the stage
#        documents', not the fixture's, and the origin built in;
#      - db-migrate: its install and build, the pull request's `plan` (offline,
#        every checksum verified), then the merge's `apply` — the step a push
#        to main runs — against a stand-in for D1's REST API over real SQLite
#        (testing/lib/d1-api.py), which refuses any account, database or token
#        but the ones the job resolves: the emojis table, its full-text index
#        and the generated API secret created and every migration recorded;
#        then the apply again, which applies nothing;
#   3. serve the built Worker with `wrangler dev` (local D1, R2 and KV behind
#      the same bindings): with no schema the site cannot read its emojis and
#      the component's OWN `smokeCommand` REFUSES it; after the product's own
#      `db:migrate:local` the smoke passes, verbatim — the check the real
#      deploy ends with. Then, with no Replicate account connected (a fresh
#      product): the page carries the product's name and links its
#      repository, the form says Replicate is not connected, the generate
#      action and both webhooks answer "not connected" and nothing is sent
#      anywhere. And then CONNECTED: the token handed to the Worker the way
#      the deploy hands it (tooling/wire/worker-secrets.mjs, here as
#      .dev.vars), the site pointed at a stand-in Replicate API
#      (testing/lib/replicate-api.py) that refuses any token but the
#      account's and delivers each prediction back to the site's own origin,
#      signed — a prompt classified, generated and its background removed,
#      both images stored in R2 and served, the emoji on its page, in the
#      gallery and the sitemap; unsigned, foreign-key, stale and misdirected
#      deliveries refused; the classifier's refusal, Replicate's failure and
#      the daily limit (KV) each answered as the template answers them.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare tokens, apply the database, migrate it and deploy for
# real, and probe workers.dev. The D1, R2 and KV roots are verified to
# `terraform validate` and their plans are part of every pull request's lanes;
# the applies need an account.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` (or a warm store); never Replicate's. A few minutes:
# three installs and two builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
api_pid=""
rp_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
stop_group() {
  kill -TERM -- "-$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$1" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$1" 2>/dev/null || true
}
cleanup() {
  [ -z "$dev_pid" ] || stop_group "$dev_pid"
  [ -z "$api_pid" ] || stop_group "$api_pid"
  [ -z "$rp_pid" ] || stop_group "$rp_pid"
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step: what a pull request in the product
# verifies through its lanes, run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "git diff --exit-code"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# A job's steps out of a plan, by component and environment: each step's
# script (named by its id, or by a fixed name for the composition steps this
# file runs), the job's path, its env and the names of its secrets.
extract() { # PLAN COMPONENT ENV OUTDIR
  python3 - "$@" <<'PY'
import json, pathlib, re, sys
plan, comp, env, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3], pathlib.Path(sys.argv[4])
out.mkdir(parents=True, exist_ok=True)
job = next(j for j in plan["jobs"] if j["component"] == comp and j["environment"] == env)
for s in job["steps"]:
    run = s.get("run") or ""
    if not run:
        continue
    sid = s["id"]
    if "dist/runner/cli.js apply" in run:
        sid = "migrate-apply"
    elif "dist/runner/cli.js plan" in run:
        sid = "migrate-plan"
    (out / f"{re.sub(r'[^A-Za-z0-9_-]', '_', sid)}.sh").write_text(run)
    if s["id"] in ("install-workspace-dependencies", "install-dependencies"):
        (out / "install.sh").write_text(run)
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or ".")
(out / "env").write_text("".join(f"export {k}={json.dumps(v)}\n" for k, v in (job.get("env") or {}).items()))
(out / "secrets").write_text("\n".join(r["asEnv"] for r in job.get("secretRefs") or []))
PY
}

# A job's private tree, staged as orun stages it. The source checkout carries
# no build output (nothing was built in it), and its dependencies are what the
# pinned composition says: a lane-scoped install ran once in the source tree
# and is linked in, or the job installs its own.
stage_job() { # STEPS-DIR WORK-DIR LOG
  local steps="$1" work="$2" log="$3"
  [ -f "$steps/install.sh" ] || { echo "FAIL: the lane has no install step" >&2; return 1; }
  if [ "$(cat "$steps/install.scope")" = lane ]; then
    (cd "$tree" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
    [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; return 1; }
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
  else
    python3 "$here/lib/stage-job.py" "$tree" "$work"
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
    (cd "$work/$(cat "$steps/path")/$(cat "$steps/install.wd")" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
      || { echo "FAIL: the job's install did not land inside its own tree" >&2; return 1; }
  fi
}

# One step, in the runner's per-job environment: the job's env (intent
# environment `env:`), its resolved secrets (exported by the caller) and
# ORUN_ENVIRONMENT; the step runs in the component's directory.
run_step() { # STEPS-DIR WORK-DIR STEP LOG
  local steps="$1" work="$2" step="$3" log="$4"
  [ -f "$steps/$step.sh" ] || { echo "FAIL: the stage lane has no $step step" >&2; return 1; }
  echo "   ▸ $step"
  if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT=stage \
        && bash -e "$steps/$step.sh") > "$log" 2>&1; then
    echo "FAIL: the lane's $step step" >&2; tail -40 "$log" >&2; return 1
  fi
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"
s01="$(git -C "$tree" rev-parse HEAD~1)"

# ── 1. the product's one pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# The landing's build is done; its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

# ── 2. the stage lanes' steps, in each job's own tree ─────────────────────
# A pull request that changes the site and the migration component: the lanes
# `orun plan` gives it. And the merge's plan, for the step only a merge runs.
git -C "$tree" checkout -q -b e2e-pr
echo "// a change to the site's component" >> "$tree/apps/web/src/app/page.tsx"
echo "# a change to the migration component" >> "$tree/infra/db-migrate/component.yaml"
git -C "$tree" -c user.email=e2e@example.invalid -c user.name=e2e commit -qam "a pull request"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base main --head HEAD --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
(cd "$tree" && orun plan --intent intent.yaml --trigger github-push-main --env stage \
   --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
extract "$scratch/plan.json" web stage "$scratch/web"
extract "$scratch/plan.json" db-migrate stage "$scratch/mig"
extract "$scratch/plan-main.json" db-migrate stage "$scratch/mig-main"

# What the platform resolves into the jobs before their first step: the
# wiring documents the D1, R2 and KV roots lease-published (the components'
# secretEnv), with a database id, a bucket name and a namespace id no fixture
# carries, so the built config and the migrated database prove which
# documents they came from.
d1_id="5ca1ab1e-0000-4000-8000-00000000a001"
kv_id="5ca1ab1e00004000800000000000a001"
bucket="e2e-$repo-stage-bucket"
export WIRING_CLOUDFLARE_D1_STAGE='{"d1_database_id":"'"$d1_id"'","d1_database_name":"stg-'"$repo"'-stage"}'
export WIRING_CLOUDFLARE_D1_PROD='{"d1_database_id":"5ca1ab1e-0000-4000-8000-00000000a003","d1_database_name":"prod-'"$repo"'-prod"}'
export WIRING_CLOUDFLARE_R2_STAGE='{"r2_bucket_name":"'"$bucket"'"}'
export WIRING_CLOUDFLARE_R2_PROD='{"r2_bucket_name":"prod-'"$repo"'-prod"}'
export WIRING_CLOUDFLARE_KV_STAGE='{"app_kv_id":"'"$kv_id"'","app_kv_title":"'"$repo"'-app-kv-stage"}'
export WIRING_CLOUDFLARE_KV_PROD='{"app_kv_id":"5ca1ab1e00004000800000000000a003","app_kv_title":"'"$repo"'-app-kv-prod"}'
# The origin this environment's build is for (intent.yaml's SITE_URL — here
# the wrangler dev it is served from in step 3): Replicate's webhooks are
# delivered to it, so the stand-in Replicate must be able to reach it.
port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
url="http://127.0.0.1:$port"
export SITE_URL="$url"

echo "── the stage web lane: verify-app-structure, build-app, verify-build-output, deploy-dry-run"
for key in WIRING_CLOUDFLARE_D1_STAGE WIRING_CLOUDFLARE_D1_PROD WIRING_CLOUDFLARE_R2_STAGE WIRING_CLOUDFLARE_R2_PROD \
           WIRING_CLOUDFLARE_KV_STAGE WIRING_CLOUDFLARE_KV_PROD; do
  grep -qx "$key" "$scratch/web/secrets" || { echo "FAIL: the stage web lane does not resolve $key" >&2; exit 1; }
done
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
stage_job "$scratch/web" "$work" "$scratch/install-web.log"
[ ! -e "$work/apps/web/.open-next" ] || { echo "FAIL: the staged tree carries build output" >&2; exit 1; }
for step in verify-app-structure build-app verify-build-output deploy-dry-run; do
  run_step "$scratch/web" "$work" "$step" "$scratch/$step.log"
done
for want in "\"$d1_id\"" "\"$bucket\"" "\"$kv_id\""; do
  grep -q "$want" "$work/apps/web/wrangler.jsonc" \
    || { echo "FAIL: the lane's build did not render $want from its wiring document" >&2; exit 1; }
done
# wrangler's dry run names a D1 binding's database by name, not id.
grep -Eq "env\.DB \(stg-$repo-stage\) +D1 Database" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind DB to the stage database" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq "env\.IMAGES \($bucket\) +R2 Bucket" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind IMAGES to the stage bucket" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq "env\.RATE_LIMIT \($kv_id\) +KV Namespace" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind RATE_LIMIT to the stage namespace" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
# The environment's origin, built into the Worker: where Replicate's webhooks go.
grep -rqF "$url" "$work/apps/web/.open-next/server-functions" \
  || { echo "FAIL: the lane's build did not build the environment's origin ($url) into the Worker" >&2; exit 1; }
echo "   the built config binds DB, IMAGES and RATE_LIMIT to the stage documents' database ($d1_id), bucket"
echo "   ($bucket) and namespace ($kv_id), built for its origin; the dry run accepts it"

echo "── the stage db-migrate lane: install, build, the PR's plan, the merge's apply (a stand-in D1 API)"
for key in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WIRING_CLOUDFLARE_D1; do
  grep -qx "$key" "$scratch/mig-main/secrets" || { echo "FAIL: the stage db-migrate lane does not resolve $key" >&2; exit 1; }
done
[ -f "$scratch/mig/migrate-plan.sh" ] && [ ! -f "$scratch/mig/migrate-apply.sh" ] \
  || { echo "FAIL: a pull request's db-migrate lane must plan and not apply" >&2; ls "$scratch/mig" >&2; exit 1; }
[ -f "$scratch/mig-main/migrate-apply.sh" ] && [ ! -f "$scratch/mig-main/migrate-plan.sh" ] \
  || { echo "FAIL: the merge's db-migrate lane must apply" >&2; ls "$scratch/mig-main" >&2; exit 1; }
mwork="$tree/.orun/runs/e2e/db-migrate.stage.migrate/work"
stage_job "$scratch/mig" "$mwork" "$scratch/install-mig.log"
run_step "$scratch/mig" "$mwork" build-db-package "$scratch/mig-build.log"
run_step "$scratch/mig" "$mwork" migrate-plan "$scratch/mig-plan.log"
for id in 010_emojis 020_app_secrets; do
  grep -q "\"$id\"" "$scratch/mig-plan.log" \
    || { echo "FAIL: the plan does not list $id as pending" >&2; cat "$scratch/mig-plan.log" >&2; exit 1; }
done
# The stand-in D1 API: only this account, this database (the stage
# document's id) and this token are answered.
(exec setsid python3 "$here/lib/d1-api.py" "$scratch/d1.sqlite" "$scratch/d1.port" \
   --account e2e-account --database "$d1_id" --token e2e-d1-token) > "$scratch/d1-api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 50); do [ -s "$scratch/d1.port" ] && break; sleep 0.1; done
[ -s "$scratch/d1.port" ] || { echo "FAIL: the stand-in D1 API did not start" >&2; cat "$scratch/d1-api.log" >&2; exit 1; }
export CLOUDFLARE_API_BASE_URL="http://127.0.0.1:$(cat "$scratch/d1.port")/client/v4"
# The job's own secrets: the D1 token as CLOUDFLARE_API_TOKEN, the account id,
# and this environment's wiring document.
for pass in first again; do
  (export CLOUDFLARE_API_TOKEN=e2e-d1-token CLOUDFLARE_ACCOUNT_ID=e2e-account \
          WIRING_CLOUDFLARE_D1="$WIRING_CLOUDFLARE_D1_STAGE" \
   && run_step "$scratch/mig-main" "$mwork" migrate-apply "$scratch/mig-apply-$pass.log") || exit 1
done
python3 - "$scratch/d1.sqlite" "$scratch/mig-apply-first.log" "$scratch/mig-apply-again.log" <<'PY'
import json, re, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
def result(path):
    text = open(path).read()
    return json.loads(text[text.index("{"):text.rindex("}") + 1])
first, again = result(sys.argv[2]), result(sys.argv[3])
problems = []
ALL = ["000_control_baseline", "010_emojis", "020_app_secrets"]
if first["applied"] != ALL:
    problems.append(f"the first apply applied {first['applied']}")
if again["applied"] or again["skipped"] != ALL:
    problems.append(f"the second apply applied {again['applied']} and skipped {again['skipped']} — it must apply nothing")
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
if not {"emojis", "emojis_fts", "app_secrets"} <= tables:
    problems.append(f"the database holds the tables {sorted(tables)}")
if db.execute("SELECT count(*) FROM emojis").fetchone()[0] != 0:
    problems.append("a fresh database holds emojis")
secret = db.execute("SELECT value FROM app_secrets WHERE name = 'api'").fetchone()
if not secret or not re.fullmatch(r"[0-9a-f]{64}", secret[0]):
    problems.append(f"the generated API secret is {secret}")
ledger = [r[0] for r in db.execute("SELECT id FROM _migrations_applied ORDER BY id")]
if ledger != ALL:
    problems.append(f"the ledger records {ledger}")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY
grep -q 'POST /client/v4/accounts/e2e-account/d1/database/'"$d1_id"'/query' "$scratch/d1-api.log" \
  || { echo "FAIL: the runner did not call the stage database's query endpoint" >&2; exit 1; }
echo "   the stage document's database: the emojis, their full-text index and a generated API secret,"
echo "   every migration recorded; the second apply applied nothing"
stop_group "$api_pid"; api_pid=""
unset CLOUDFLARE_API_BASE_URL


# ── 3. serve it, and smoke it as the deploy does ───────────────────────────
# On the port the build was given as its origin (step 2), so the webhooks the
# stand-in Replicate delivers reach this Worker.
start_dev() { # LOG
  (cd "$work/apps/web" && exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$port" \
     --name "$repo-web-stage" --show-interactive-dev-session=false) > "$scratch/$1.log" 2>&1 < /dev/null &
  dev_pid=$!
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$url/icon.svg" && break
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$scratch/$1.log" >&2; exit 1; }
    sleep 1
  done
  curl -s -o /dev/null "$url/icon.svg" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$scratch/$1.log" >&2; exit 1; }
}
echo "── wrangler dev over the built Worker (local D1, R2 and KV behind DB, IMAGES and RATE_LIMIT), no Replicate connected"
start_dev dev
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"

echo "   ▸ no schema yet: no emojis table — the health route fails, and the deploy's smoke refuses it"
code="$(curl -s -o /dev/null -w '%{http_code}' "$url/api/health")"
[ "$code" = 500 ] || { echo "FAIL: /api/health answered $code without the emojis table, not 500" >&2; exit 1; }
if DEPLOYED_URL="$url" bash -c "$smoke"; then
  echo "FAIL: the deploy's smoke passed a site that could not read its database" >&2; exit 1
fi

echo "   ▸ the product's own db:migrate:local, then the component's own smokeCommand, DEPLOYED_URL=$url"
(cd "$work/apps/web" && pnpm run db:migrate:local) > "$scratch/migrate-local.log" 2>&1 \
  || { echo "FAIL: db:migrate:local" >&2; tail -20 "$scratch/migrate-local.log" >&2; exit 1; }
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the migrated site" >&2; exit 1; }

# The routes as a browser and the generate form make them. One script for both
# passes: CONNECTED says which.
cat > "$scratch/routes.py" <<'PY'
import base64, hashlib, hmac, html, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
base, values, app, action, connected = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4], sys.argv[5] == "1"
name, repo, org = values["productname"], values["reponame"], values["githuborg"]
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
problems = []
def bad(m): problems.append(m)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
plain = urllib.request.build_opener(NoRedirect())
def get(path, data=None, headers=None):
    req = urllib.request.Request(base + path, data=data, headers=headers or {})
    try:
        with plain.open(req, timeout=30) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
def page(path):
    s, h, b = get(path)
    return s, h, b.decode(errors="replace")
def text(fragment): return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()
def token():
    s, _, b = get("/api/token")
    if s != 200:
        bad(f"/api/token answered {s}")
        return ""
    return json.loads(b)["token"]
def create(prompt, tok):
    """The generate form's action, as the page posts it: (previous state, the form)."""
    r = subprocess.run(["node", action, base, "createEmoji", "--prev", "null", f"prompt={prompt}", f"token={tok}"],
                       cwd=app, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    if r.returncode != 0 or not lines:
        bad(f"createEmoji({prompt!r}) answered {r.stdout.strip() or r.stderr.strip()}")
        return None, None
    redirect = next((l.split(" ", 1)[1] for l in lines if l.startswith("redirect ")), None)
    result = json.loads(lines[-1]) if not redirect and lines[-1].startswith("{") else None
    return redirect, result
def emoji(eid):
    s, _, b = get(f"/api/emojis/{eid}")
    return json.loads(b)["emoji"] if s == 200 else None
def wait_for(eid, done, seconds=30):
    end = time.time() + seconds
    while time.time() < end:
        e = emoji(eid)
        if e and done(e):
            return e
        time.sleep(0.5)
    return emoji(eid)

# THE SITE, BRANDED: the product's name and repository, nothing of the baseline's.
status, _, home = page("/")
if status != 200:
    bad(f"/ answered {status}")
title = re.search(r"<title>(.*?)</title>", home, re.S)
if not title or text(title.group(1)) != name:
    bad(f"the page's <title> is {title and title.group(1)!r}, not {name!r}")
links = sorted(set(re.findall(r'href="(https://github\.com/[^"]*)"', home)))
if links != [f"https://github.com/{org}/{repo}"]:
    bad(f"the page's repository links are {links}, not github.com/{org}/{repo}")
if name not in text(home):
    bad("the page does not carry the product's name")
if "ai-emoji-generator" in home:
    bad("the page still carries the baseline's slug")
marker = 'data-replicate="not-connected"' in home
if marker == connected:
    bad(f"/ is{'' if marker else ' not'} showing the connect-Replicate notice, connected={connected}")
for path, want, ctype in (("/icon.svg", 200, "image/svg"), ("/no-such-page", 404, "text/html"),
                          ("/sitemap.xml", 200, "application/xml"), ("/opengraph-image", 200, "image/png"),
                          ("/api/images/not-an-image-key", 404, "text/plain"), ("/api/emojis/nope000000", 404, "application/json")):
    s, h, _ = get(path)
    if s != want or not (h.get("content-type") or "").startswith(ctype):
        bad(f"{path} answered {s} {h.get('content-type')}, want {want} {ctype}")
s, h, _ = get("/p/nope000000")
if s not in (302, 303, 307) or urllib.parse.urlparse(h.get("location", "")).path not in ("", "/"):
    bad(f"/p/<unknown> answered {s} → {h.get('location')}, not a redirect home")
if base not in page("/sitemap.xml")[2]:
    bad("the sitemap is not built on the environment's origin")

health = json.loads(get("/api/health")[2])
if health.get("ok") is not True or health.get("replicate") != ("connected" if connected else "not-connected"):
    bad(f"/api/health answered {health}")
tok = token()
if not re.fullmatch(r"[\w-]+\.[\w-]+\.[\w-]+", tok or ""):
    bad(f"/api/token's token is {tok!r}, not a JWT")

if not connected:
    if health != {"ok": True, "emojis": 0, "replicate": "not-connected"}:
        bad(f"a fresh, unconnected site's health is {health}")
    redirect, result = create("cat", tok)
    if redirect or not result or "REPLICATE_API_TOKEN" not in result.get("message", ""):
        bad(f"not connected, the generate action answered {redirect or result}")
    for stage in ("remove-background", "save-emoji"):
        s, _, b = get(f"/api/webhook/{stage}?id=AbCdEf1234&token=x", data=b"{}", headers={"content-type": "application/json"})
        if s != 503:
            bad(f"not connected, the {stage} webhook answered {s} {b[:120]!r}")
else:
    # A PROMPT BECOMES AN EMOJI: classified, generated, delivered back to the
    # site signed, its original stored, its background removed, delivered again
    # and stored — then on its page, in the gallery and in the sitemap.
    redirect, result = create("a happy cat", tok)
    m = re.fullmatch(r"/p/([0-9A-Za-z]{10})", redirect or "")
    if not m:
        bad(f"the generate action answered {redirect or result}, not a redirect to the emoji's page")
    else:
        eid = m.group(1)
        e = wait_for(eid, lambda e: e.get("noBackgroundUrl"))
        if not e or e.get("originalUrl") != f"/api/images/{eid}-original.png" \
                or e.get("noBackgroundUrl") != f"/api/images/{eid}-no-background.png" or e.get("isFlagged") or e.get("error"):
            bad(f"the emoji, after both deliveries, is {e}")
        for key in (f"{eid}-original.png", f"{eid}-no-background.png"):
            s, h, b = get(f"/api/images/{key}")
            if s != 200 or h.get("content-type") != "image/png" or b != PNG:
                bad(f"/api/images/{key} answered {s} {h.get('content-type')} ({len(b)} bytes), not the model's PNG")
        s, _, p = page(f"/p/{eid}")
        t = re.search(r"<title>(.*?)</title>", p, re.S)
        if s != 200 or not t or text(t.group(1)) != f"a-happy-cat | {name}":
            bad(f"/p/{eid} answered {s} titled {t and t.group(1)!r}")
        if f"/api/images/{eid}-no-background.png" not in page("/")[2]:
            bad("the gallery on / does not show the new emoji")
        if f"{base}/p/{eid}" not in page("/api/sitemaps/0")[2]:
            bad("the sitemap does not list the new emoji")
        s, h, _ = get(f"/p/{eid}/opengraph-image")
        if s != 200 or h.get("content-type") != "image/png":
            bad(f"/p/{eid}/opengraph-image answered {s} {h.get('content-type')}")
        # A delivery is accepted only signed by Replicate, fresh, for this emoji's own URL.
        secret = os.environ["E2E_WEBHOOK_SECRET"]
        log = [json.loads(l) for l in open(os.environ["E2E_REPLICATE_LOG"])]
        hook = next(l["webhook"] for l in log if "delivery" in l and f"id={eid}" in l["webhook"] and "save-emoji" in l["webhook"])
        path = hook[len(base):]
        body = json.dumps({"id": "forged", "status": "succeeded", "output": "http://127.0.0.1:9/evil.png"})
        def signed(key, age=0, path=path):
            ts = str(int(time.time()) - age)
            sig = base64.b64encode(hmac.new(base64.b64decode(key.split("_", 1)[1]), f"m.{ts}.{body}".encode(), hashlib.sha256).digest()).decode()
            return get(path, data=body.encode(), headers={"content-type": "application/json", "webhook-id": "m",
                                                           "webhook-timestamp": ts, "webhook-signature": f"v1,{sig}"})[0]
        other_key = "whsec_" + base64.b64encode(b"not-the-account-signing-key").decode()
        other_emoji = re.sub(r"token=[^&]+", "token=" + "A" * 43, path)
        for case, got in (("unsigned", get(path, data=body.encode(), headers={"content-type": "application/json"})[0]),
                          ("signed with another key", signed(other_key)),
                          ("an hour old", signed(secret, 3600)),
                          ("for another emoji's URL", signed(secret, path=other_emoji))):
            if got != 403:
                bad(f"a delivery {case} answered {got}, not 403")
        if emoji(eid).get("noBackgroundUrl") != f"/api/images/{eid}-no-background.png":
            bad("a refused delivery changed the emoji")
    # The template's safety classifier refuses a prompt, and a failed generation is flagged with Replicate's error.
    redirect, result = create("forbidden thing", tok)
    if redirect or "keep it PG" not in (result or {}).get("message", ""):
        bad(f"a prompt the classifier refuses answered {redirect or result}")
    redirect, result = create("explode", tok)
    m = re.fullmatch(r"/p/([0-9A-Za-z]{10})", redirect or "")
    e = wait_for(m.group(1), lambda e: e.get("error")) if m else None
    if not e or not e.get("isFlagged") or "NSFW" not in (e.get("error") or ""):
        bad(f"a generation Replicate failed is {e}")
    # The daily limit (RATE_LIMIT_PER_DAY=4 here): the fourth goes through, the fifth does not.
    redirect, _ = create("a dog", tok)
    m = re.fullmatch(r"/p/([0-9A-Za-z]{10})", redirect or "")
    if not m:
        bad("the fourth generation of the day was refused")
    elif not (wait_for(m.group(1), lambda e: e.get("noBackgroundUrl")) or {}).get("noBackgroundUrl"):
        bad("the fourth emoji never finished")
    redirect, result = create("a fish", tok)
    if redirect or "Daily limit" not in (result or {}).get("message", ""):
        bad(f"the fifth generation of the day answered {redirect or result}, not the daily limit")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
PY

echo "   ▸ every route the site promises, with no Replicate account connected"
python3 "$scratch/routes.py" "$url" "$values" "$work/apps/web" "$here/lib/server-action.mjs" 0 \
  || { echo "FAIL: the routes, not connected" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }
echo "   / (the product's name, its repository, the connect-Replicate notice), the sitemap, the Open Graph"
echo "   image, /api/health and /api/token; the generate action and both webhooks answering 'not connected'"
stop_group "$dev_pid"; dev_pid=""

echo "── connected: Replicate's token handed to the Worker as the deploy hands it, against a stand-in Replicate"
key="r8_e2e_offline_fixture_not_a_token"
export E2E_WEBHOOK_SECRET="whsec_$(python3 -c 'import base64,os;print(base64.b64encode(os.urandom(24)).decode())')"
export E2E_REPLICATE_LOG="$scratch/rp.log"
(exec setsid python3 "$here/lib/replicate-api.py" "$scratch/rp.port" "$E2E_REPLICATE_LOG" --token "$key" \
   --secret "$E2E_WEBHOOK_SECRET") > "$scratch/rp-api.log" 2>&1 < /dev/null &
rp_pid=$!
for _ in $(seq 1 50); do [ -s "$scratch/rp.port" ] && break; sleep 0.1; done
[ -s "$scratch/rp.port" ] || { echo "FAIL: the stand-in Replicate API did not start" >&2; cat "$scratch/rp-api.log" >&2; exit 1; }
# The product's own secrets push, writing what `wrangler secret bulk` would
# receive as the local Worker's secrets — and where the API is, and a small
# daily limit to reach.
(cd "$work/apps/web" && REPLICATE_API_TOKEN="$key" \
   node ../../tooling/wire/worker-secrets.mjs --secret REPLICATE_API_TOKEN --dev-vars .dev.vars) > "$scratch/dev-vars.log" 2>&1 \
  || { echo "FAIL: worker-secrets.mjs --dev-vars" >&2; cat "$scratch/dev-vars.log" >&2; exit 1; }
printf 'REPLICATE_API_BASE="http://127.0.0.1:%s/v1"\nRATE_LIMIT_PER_DAY="4"\n' "$(cat "$scratch/rp.port")" >> "$work/apps/web/.dev.vars"
start_dev dev-connected
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the connected site" >&2; exit 1; }
python3 "$scratch/routes.py" "$url" "$values" "$work/apps/web" "$here/lib/server-action.mjs" 1 \
  || { echo "FAIL: the routes, connected" >&2; tail -20 "$scratch/dev-connected.log" >&2; exit 1; }
python3 - "$E2E_REPLICATE_LOG" "$url" <<'PY'
import json, sys
calls = [json.loads(l) for l in open(sys.argv[1])]
base = sys.argv[2]
api = [c for c in calls if "method" in c and c["path"].startswith("/v1/")]
deliveries = [c for c in calls if "delivery" in c]
problems = []
if not api or not all(c["token"] for c in api):
    problems.append(f"a request reached Replicate without the account's token: {[c for c in api if not c['token']]}")
if not any(c["path"] == "/v1/webhooks/default/secret" for c in api):
    problems.append("the site never read the account's webhook signing secret")
classified = [c for c in api if c["path"] == "/v1/predictions" and c.get("prefer") == "wait"]
if len(classified) != 4:
    problems.append(f"{len(classified)} prompts were classified; four generations were started")
for d in deliveries:
    if not d["webhook"].startswith(base + "/api/webhook/") or "token=" not in d["webhook"] or "secret=" in d["webhook"]:
        problems.append(f"a webhook URL is {d['webhook']}")
    if d["status"] != 200:
        problems.append(f"the site answered a signed delivery {d['status']}: {d['webhook']}")
if len(deliveries) != 5:
    problems.append(f"Replicate delivered {len(deliveries)} predictions; want 5 (two each for two emojis, one failure)")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY
echo "   the smoke and the routes again; a prompt classified, generated and delivered back signed — the original"
echo "   and the background-removed image stored in R2, the emoji on its page, in the gallery and the sitemap;"
echo "   unsigned, foreign, stale and misdirected deliveries refused; the classifier's refusal, Replicate's"
echo "   failure and the daily limit; every request to Replicate carried the account's token"
stop_group "$dev_pid"; dev_pid=""
stop_group "$rp_pid"; rp_pid=""

echo "e2e.test.sh: ok"
