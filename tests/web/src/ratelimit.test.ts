import { beforeEach, describe, expect, it, vi } from "vitest";
import { kv } from "./support/bindings";

// apps/web/src/server/ratelimit.ts: the template's daily limit in Workers KV.
let store: ReturnType<typeof kv>;
const env: Record<string, unknown> = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));

beforeEach(() => {
  store = kv();
  for (const k of Object.keys(env)) delete env[k];
  env.RATE_LIMIT = store;
  vi.resetModules();
});

describe("the daily limit", () => {
  it("lets a visitor start up to the template's 500 a day, and no more", async () => {
    const { limit } = await import("@/server/ratelimit");
    for (let i = 0; i < 500; i += 1) expect((await limit("203.0.113.7")).success).toBe(true);
    expect(await limit("203.0.113.7")).toEqual({ success: false, remaining: 0 });
    // another visitor is counted apart
    expect((await limit("203.0.113.8")).success).toBe(true);
  });

  it("counts per UTC day, and lets the count expire after it", async () => {
    env.RATE_LIMIT_PER_DAY = "2";
    const { limit } = await import("@/server/ratelimit");
    expect(await limit("198.51.100.1")).toEqual({ success: true, remaining: 1 });
    expect(await limit("198.51.100.1")).toEqual({ success: true, remaining: 0 });
    expect((await limit("198.51.100.1")).success).toBe(false);
    const [key, entry] = [...store.values.entries()][0]!;
    expect(key).toMatch(/^ratelimit:\d{4}-\d{2}-\d{2}:198\.51\.100\.1$/);
    expect(entry.ttl).toBe(2 * 24 * 60 * 60);
  });
});
