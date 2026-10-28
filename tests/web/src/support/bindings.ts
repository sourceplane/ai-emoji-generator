import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

// The Worker's bindings for the app's server modules, over real engines where
// one exists: D1 over node:sqlite (D1's engine — FTS5 included) with
// packages/db's migrations applied, R2 and KV over Maps.
type Row = Record<string, unknown>;
export interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): { all(...params: unknown[]): Row[]; run(...params: unknown[]): unknown };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (file: string) => Sqlite;
};
const migrationsDir = path.resolve(__dirname, "../../../../packages/db/src/migrations");
export const MIGRATIONS = ["010_emojis", "020_app_secrets"];

export function sqlite(names = MIGRATIONS): Sqlite {
  const db = new DatabaseSync(":memory:");
  for (const name of names) db.exec(readFileSync(path.join(migrationsDir, name, "up.sql"), "utf8"));
  return db;
}

/** The D1 binding's shape (prepare → bind → first/all/run, batch) over a SQLite database. */
export function d1(db: Sqlite) {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    async first<T>() {
      return (db.prepare(sql).all(...params)[0] as T | undefined) ?? null;
    },
    async all<T>() {
      return { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[] };
    },
    async run() {
      db.prepare(sql).run(...params);
      return { success: true };
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: { run(): Promise<unknown> }[]) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    },
  };
}

/** R2's put/get over a Map. */
export function r2() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>();
  return {
    objects,
    async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body: new Uint8Array(body), contentType: opts?.httpMetadata?.contentType });
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: o.body,
        httpEtag: `"${key}"`,
        httpMetadata: { contentType: o.contentType },
        async arrayBuffer() {
          return o.body.slice().buffer;
        },
      };
    },
  };
}

/** KV's get/put over a Map (TTLs recorded, not enforced). */
export function kv() {
  const values = new Map<string, { value: string; ttl?: number }>();
  return {
    values,
    async get(key: string) {
      return values.get(key)?.value ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      values.set(key, { value, ttl: opts?.expirationTtl });
    },
  };
}
