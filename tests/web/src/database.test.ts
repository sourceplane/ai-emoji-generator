import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1, sqlite, type Sqlite } from "./support/bindings";

// apps/web/src/server's reads and writes over a real SQLite database with
// packages/db's migrations applied: the template's Prisma queries, as D1 SQL.
let db: Sqlite;
const env: Record<string, unknown> = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));

beforeEach(() => {
  db = sqlite();
  for (const k of Object.keys(env)) delete env[k];
  env.DB = d1(db);
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());

async function seed(rows: { id: string; prompt: string; done?: boolean; flagged?: boolean; at: string }[]) {
  const { createEmojiRow, updateEmojiRow } = await import("@/server/emojis");
  for (const r of rows) {
    await createEmojiRow({ id: r.id, prompt: r.prompt, safetyRating: 1, isFlagged: r.flagged });
    db.prepare("UPDATE emojis SET created_at = ? WHERE id = ?").run(r.at, r.id);
    if (r.done !== false) {
      await updateEmojiRow(r.id, { originalUrl: `/api/images/${r.id}-original.png`, noBackgroundUrl: `/api/images/${r.id}-no-background.png` });
    }
  }
}

describe("the emojis", () => {
  it("reads an emoji as the template's model, and nothing for an unknown id", async () => {
    await seed([{ id: "aaaaaaaaaa", prompt: "happy cat", at: "2026-01-01T00:00:00.000Z" }]);
    const { getEmoji } = await import("@/server/get-emoji");
    const e = await getEmoji("aaaaaaaaaa");
    expect(e).toMatchObject({
      id: "aaaaaaaaaa",
      prompt: "happy cat",
      isFlagged: false,
      isFeatured: false,
      safetyRating: 1,
      error: null,
      noBackgroundUrl: "/api/images/aaaaaaaaaa-no-background.png",
    });
    expect(e?.createdAt).toBeInstanceOf(Date);
    expect(await getEmoji("nope000000")).toBeNull();
  });

  it("lists only finished, unflagged emojis, newest first — oldest first for the sitemap", async () => {
    await seed([
      { id: "old0000000", prompt: "old", at: "2026-01-01T00:00:00.000Z" },
      { id: "new0000000", prompt: "new", at: "2026-01-03T00:00:00.000Z" },
      { id: "flag000000", prompt: "bad", flagged: true, at: "2026-01-04T00:00:00.000Z" },
      { id: "wait000000", prompt: "pending", done: false, at: "2026-01-05T00:00:00.000Z" },
    ]);
    const { getEmojis } = await import("@/server/get-emojis");
    expect((await getEmojis({})).map((e) => e.id)).toEqual(["new0000000", "old0000000"]);
    expect((await getEmojis({ order: "oldest" })).map((e) => e.id)).toEqual(["old0000000", "new0000000"]);
    expect((await getEmojis({ take: 1, skip: 1 })).map((e) => e.id)).toEqual(["old0000000"]);
  });

  it("counts every emoji made, as the template's counter did", async () => {
    await seed([
      { id: "one0000000", prompt: "one", at: "2026-01-01T00:00:00.000Z" },
      { id: "two0000000", prompt: "two", flagged: true, at: "2026-01-02T00:00:00.000Z" },
    ]);
    const { getEmojisCount } = await import("@/server/get-emojis-count");
    expect(await getEmojisCount()).toBe(2);
  });

  it("puts related emojis first, best match first, then fills with the newest", async () => {
    await seed([
      { id: "cat0000000", prompt: "cat", at: "2026-01-01T00:00:00.000Z" },
      { id: "cathat0000", prompt: "cat in a hat", at: "2026-01-02T00:00:00.000Z" },
      { id: "dog0000000", prompt: "dog", at: "2026-01-03T00:00:00.000Z" },
      { id: "hidden0000", prompt: "cat", flagged: true, at: "2026-01-04T00:00:00.000Z" },
    ]);
    const { getEmojis } = await import("@/server/get-emojis");
    const ids = (await getEmojis({ prompt: "cat" })).map((e) => e.id);
    expect(ids.slice(0, 2).sort()).toEqual(["cat0000000", "cathat0000"]);
    expect(ids).toEqual(expect.arrayContaining(["dog0000000"]));
    expect(ids).not.toContain("hidden0000");
    expect(new Set(ids).size).toBe(ids.length);
    expect((await getEmojis({ prompt: "cat", take: 1 })).length).toBe(1);
  });

  it("reads a visitor's prompt as words, never as full-text query syntax", async () => {
    await seed([{ id: "cat0000000", prompt: "cat", at: "2026-01-01T00:00:00.000Z" }]);
    const { ftsQuery, getEmojis } = await import("@/server/get-emojis");
    expect(ftsQuery('cat OR "dog" NEAR(')).toBe('"cat" OR "OR" OR "dog" OR "NEAR"');
    expect(ftsQuery("***")).toBeNull();
    // A prompt that would be a syntax error if passed through still answers.
    expect((await getEmojis({ prompt: '"unclosed AND (' })).map((e) => e.id)).toEqual(["cat0000000"]);
  });

  it("updates an emoji and moves its updatedAt", async () => {
    await seed([{ id: "aaaaaaaaaa", prompt: "x", done: false, at: "2026-01-01T00:00:00.000Z" }]);
    db.prepare("UPDATE emojis SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = 'aaaaaaaaaa'").run();
    const { updateEmojiRow } = await import("@/server/emojis");
    await updateEmojiRow("aaaaaaaaaa", { isFlagged: true, error: "NSFW" });
    const row = db.prepare("SELECT is_flagged, error, updated_at FROM emojis WHERE id = 'aaaaaaaaaa'").all()[0]!;
    expect(row.is_flagged).toBe(1);
    expect(row.error).toBe("NSFW");
    expect(String(row.updated_at) > "2000-01-01").toBe(true);
  });
});

describe("the API secret", () => {
  it("is the one generated in the database, unless API_SECRET is set", async () => {
    const generated = String(db.prepare("SELECT value FROM app_secrets WHERE name = 'api'").all()[0]!.value);
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    const { appSecret } = await import("@/server/secrets");
    expect(await appSecret("api")).toBe(generated);
    vi.resetModules();
    env.API_SECRET = "from-a-worker-secret";
    const again = await import("@/server/secrets");
    expect(await again.appSecret("api")).toBe("from-a-worker-secret");
  });

  it("says to migrate when the database has none", async () => {
    db.prepare("DELETE FROM app_secrets").run();
    const { appSecret } = await import("@/server/secrets");
    await expect(appSecret("api")).rejects.toThrow(/apply the migrations/);
  });
});
