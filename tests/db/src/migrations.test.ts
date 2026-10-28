import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { D1ApiAdapter, loadD1CredentialsFromEnv, runMigrations } from "@saas/db/runner";
import type { MigrationManifest } from "@saas/db/types";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");

// node:sqlite is real SQLite — D1's engine — so the migrations run here
// against the database semantics they meet in production. Loaded through
// require: it is newer than the bundler's list of Node built-ins.
type Row = Record<string, unknown>;
interface Sqlite {
  prepare(sql: string): { all(...params: unknown[]): Row[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (file: string) => Sqlite;
};

// A stand-in for D1's REST API (`POST …/d1/database/{id}/query`, one statement
// per call, `{ sql, params }` in, `{ success, result: [{ results }] }` out),
// over a real SQLite database: the adapter is exercised through the same
// request and response shapes the db-migrate lane sends to Cloudflare.
function fakeD1(db: Sqlite) {
  const requests: { url: string; auth: string | null; sql: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const { sql, params } = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
    requests.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), sql });
    try {
      const results = db.prepare(sql).all(...params);
      return new Response(JSON.stringify({ success: true, result: [{ results, success: true }] }), { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ success: false, errors: [{ code: 7500, message }] }), { status: 400 });
    }
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function tables(db: Sqlite): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => String(r.name));
}

const ALL = ["000_control_baseline", "010_emojis", "020_app_secrets"];
// FTS5 keeps its index in shadow tables named after it; the schema's own
// tables are the rest.
const own = (names: string[]) => names.filter((n) => !n.startsWith("emojis_fts_"));

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration, in id order, and names every file with its checksum", () => {
    const ids = manifest.migrations.map((m) => m.id);
    expect(ids[0]).toBe("000_control_baseline");
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("writes every statement idempotently, so a re-run is a no-op", () => {
    for (const entry of manifest.migrations.slice(1)) {
      const sql = readFileSync(path.join(migrationsDir, entry.path), "utf8");
      for (const statement of D1ApiAdapter.splitStatements(sql)) {
        const body = statement.replace(/^(--[^\n]*\n)*/, "").trim();
        // FTS5's index is a virtual table, created IF NOT EXISTS like the rest.
        expect(body, entry.id).toMatch(/^(CREATE (VIRTUAL TABLE|TABLE|INDEX) IF NOT EXISTS|INSERT OR IGNORE INTO) /);
      }
    }
  });

  it("plans every migration as pending offline (a pull request's plan profile)", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  it("refuses a file that no longer matches its checksum, even offline", async () => {
    const tampered: MigrationManifest = {
      version: 1,
      migrations: manifest.migrations.map((m, i) => (i === 1 ? { ...m, checksum: "0".repeat(64) } : m)),
    };
    await expect(runMigrations(tampered, { mode: "plan", migrationsDir, adapter: null })).rejects.toThrow(
      /Checksum mismatch for 010_emojis/,
    );
  });
});

describe("db-migrate apply, over the D1 REST API, into real SQLite", () => {
  let db: Sqlite;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
  });

  it("creates the emojis the app reads, their full-text index and the API secret, and records what it applied", async () => {
    const { fetchImpl, requests } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    const result = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(ALL);
    expect(own(tables(db))).toEqual(["_migrations_applied", "_migrations_lock", "app_secrets", "emojis", "emojis_fts"]);
    expect(db.prepare("SELECT id FROM _migrations_applied ORDER BY id").all().map((r) => r.id)).toEqual(ALL);
    // The lock is released, and every call was the account's database with the token.
    expect(db.prepare("SELECT * FROM _migrations_lock").all()).toEqual([]);
    expect(new Set(requests.map((r) => r.url))).toEqual(
      new Set(["https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db-id/query"]),
    );
    expect(new Set(requests.map((r) => r.auth))).toEqual(new Set(["Bearer token"]));

    // The app's own statements (apps/web/src/server) on that schema: an emoji
    // and its index entry as createEmojiRow writes them, found by a word of its
    // prompt the way the "related emojis" grid asks, defaults filled in.
    db.prepare("INSERT INTO emojis (id, prompt, safety_rating) VALUES (?, ?, ?)").all("AbCdEf1234", "cat in a hat", 2);
    db.prepare("INSERT INTO emojis_fts (id, prompt) VALUES (?, ?)").all("AbCdEf1234", "cat in a hat");
    const row = db.prepare("SELECT * FROM emojis WHERE id = ?").all("AbCdEf1234")[0]!;
    expect(row).toMatchObject({ is_flagged: 0, is_featured: 0, original_url: null, no_background_url: null, error: null });
    expect(String(row.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(
      db
        .prepare("SELECT e.id FROM emojis_fts f JOIN emojis e ON e.id = f.id WHERE emojis_fts MATCH ? ORDER BY bm25(emojis_fts)")
        .all('"hat"')
        .map((r) => r.id),
    ).toEqual(["AbCdEf1234"]);
    // The API secret: generated, 32 random bytes as hex.
    expect(String(db.prepare("SELECT value FROM app_secrets WHERE name = 'api'").all()[0]?.value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("applies nothing twice: a second run skips what the ledger recorded", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("INSERT INTO emojis (id, prompt, safety_rating) VALUES (?, ?, ?)").all("kept000000", "kept", 1);
    const again = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(ALL);
    expect(db.prepare("SELECT count(*) AS n FROM emojis").all()[0]?.n).toBe(1);
  });

  it("run again from scratch, never rotates the secret or drops an emoji or its index", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    const secret = db.prepare("SELECT value FROM app_secrets WHERE name = 'api'").all()[0]?.value;
    db.prepare("INSERT INTO emojis (id, prompt, safety_rating) VALUES (?, ?, ?)").all("kept000000", "a dog", 1);
    db.prepare("INSERT INTO emojis_fts (id, prompt) VALUES (?, ?)").all("kept000000", "a dog");
    // Every file again, as a database whose ledger was lost would take them.
    for (const entry of manifest.migrations.slice(1)) {
      await adapter.executeSql(readFileSync(path.join(migrationsDir, entry.path), "utf8"));
    }
    expect(db.prepare("SELECT value FROM app_secrets WHERE name = 'api'").all()[0]?.value).toBe(secret);
    expect(db.prepare("SELECT count(*) AS n FROM emojis").all()[0]?.n).toBe(1);
    expect(db.prepare("SELECT id FROM emojis_fts WHERE emojis_fts MATCH ?").all('"dog"').map((r) => r.id)).toEqual(["kept000000"]);
  });

  it("refuses to run while another runner holds the lock", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    db.prepare("INSERT INTO _migrations_lock (id, acquired_at) VALUES (?, ?)").all(
      "migrate-839201008",
      new Date().toISOString(),
    );
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /advisory lock/,
    );
    expect(tables(db)).not.toContain("emojis");
  });

  it("refuses an applied migration whose file has since changed", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("UPDATE _migrations_applied SET checksum = ? WHERE id = ?").all("f".repeat(64), "010_emojis");
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /Checksum mismatch for already-applied migrations: 010_emojis/,
    );
  });

  it("names the statement D1 refused", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    await expect(adapter.executeSql("CREATE TABLE ok(x);\nINSERT INTO nope VALUES (1);")).rejects.toThrow(
      /no such table: nope — at: INSERT INTO nope/,
    );
  });
});

describe("D1ApiAdapter.splitStatements", () => {
  it("splits on top-level semicolons only, and drops comment-only chunks", () => {
    const sql = "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b');\n-- trailing; note\nINSERT INTO a VALUES ('it''s');\n";
    expect(D1ApiAdapter.splitStatements(sql)).toEqual([
      "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b')",
      "-- trailing; note\nINSERT INTO a VALUES ('it''s')",
    ]);
  });
});

describe("the runner's environment (what the component's secretEnv resolves)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads the database id from the cloudflare-d1 wiring document", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    process.env.WIRING_CLOUDFLARE_D1 = JSON.stringify({ d1_database_id: "uuid-1", d1_database_name: "stg-x-stage" });
    expect(loadD1CredentialsFromEnv()).toEqual({ accountId: "acct", databaseId: "uuid-1", apiToken: "token" });
  });

  it("refuses to guess without a database id", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    delete process.env.WIRING_CLOUDFLARE_D1;
    expect(() => loadD1CredentialsFromEnv()).toThrow(/No D1 database id/);
  });

  it("sends to CLOUDFLARE_API_BASE_URL when it is set, as wrangler does", async () => {
    process.env.CLOUDFLARE_API_BASE_URL = "http://127.0.0.1:9/client/v4/";
    const { fetchImpl, requests } = fakeD1(new DatabaseSync(":memory:"));
    await new D1ApiAdapter("acct", "db-id", "token", fetchImpl).connect();
    expect(requests[0]?.url).toBe("http://127.0.0.1:9/client/v4/accounts/acct/d1/database/db-id/query");
  });
});
