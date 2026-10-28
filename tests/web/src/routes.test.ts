import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1, kv, r2, sqlite, type Sqlite } from "./support/bindings";

// The Worker's own routes, called as the Worker calls them: a Replicate
// delivery to /api/webhook/save-emoji, the images it stores, the health
// probe — over the fake bindings and a stubbed fetch for the model's output.
let db: Sqlite;
let images: ReturnType<typeof r2>;
const env: Record<string, unknown> = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));

const SECRET = "whsec_" + Buffer.from("e2e-signing-key-for-these-tests").toString("base64");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID = "AbCdEf1234";

beforeEach(() => {
  db = sqlite();
  images = r2();
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, { DB: d1(db), IMAGES: images, RATE_LIMIT: kv() });
  vi.resetModules();
  db.prepare("INSERT INTO emojis (id, prompt, safety_rating) VALUES (?, ?, ?)").run(ID, "cat", 1);
});
afterEach(() => vi.unstubAllGlobals());

async function delivery(body: object, { token, secret = SECRET, age = 0 }: { token?: string; secret?: string; age?: number } = {}) {
  const { signReplicateWebhook, webhookToken } = await import("@/server/webhook");
  const { appSecret } = await import("@/server/secrets");
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000) - age;
  const t = token ?? (await webhookToken(await appSecret("api"), "save-emoji", ID));
  return new Request(`https://site.test/api/webhook/save-emoji?id=${ID}&token=${t}`, {
    method: "POST",
    body: raw,
    headers: { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": await signReplicateWebhook(secret, "msg_1", ts, raw) },
  });
}

describe("a Replicate delivery to /api/webhook/save-emoji", () => {
  it("answers 503 before Replicate is connected, reading nothing", async () => {
    const { POST } = await import("@/app/api/webhook/save-emoji/route");
    const res = await POST(await delivery({ output: "https://replicate.delivery/x.png" }));
    expect(res.status).toBe(503);
    expect(images.objects.size).toBe(0);
  });

  it("stores the background-removed image in R2 and records its path", async () => {
    Object.assign(env, { REPLICATE_API_TOKEN: "r8_test", REPLICATE_WEBHOOK_SECRET: SECRET });
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(String(url));
      return new Response(PNG);
    });
    const { POST } = await import("@/app/api/webhook/save-emoji/route");
    const res = await POST(await delivery({ id: "p1", status: "succeeded", output: "https://replicate.delivery/out.png" }));
    expect(res.status).toBe(200);
    expect(fetched).toEqual(["https://replicate.delivery/out.png"]);
    expect(images.objects.get(`${ID}-no-background.png`)?.contentType).toBe("image/png");
    const row = db.prepare("SELECT no_background_url FROM emojis WHERE id = ?").all(ID)[0]!;
    expect(row.no_background_url).toBe(`/api/images/${ID}-no-background.png`);
  });

  it("refuses an unsigned, forged or stale delivery, or one carrying another emoji's token", async () => {
    Object.assign(env, { REPLICATE_API_TOKEN: "r8_test", REPLICATE_WEBHOOK_SECRET: SECRET });
    vi.stubGlobal("fetch", async () => {
      throw new Error("a refused delivery must fetch nothing");
    });
    const { POST } = await import("@/app/api/webhook/save-emoji/route");
    const body = { output: "https://evil.example/x.png" };
    const unsigned = new Request(`https://site.test/api/webhook/save-emoji?id=${ID}&token=x`, { method: "POST", body: "{}" });
    expect((await POST(unsigned)).status).toBe(403);
    const forged = "whsec_" + Buffer.from("not-the-account-secret").toString("base64");
    expect((await POST(await delivery(body, { secret: forged }))).status).toBe(403);
    expect((await POST(await delivery(body, { age: 3600 }))).status).toBe(403);
    expect((await POST(await delivery(body, { token: "A".repeat(43) }))).status).toBe(403);
    expect(images.objects.size).toBe(0);
  });
});

describe("/api/images/[key]", () => {
  it("serves a stored image and refuses any other key", async () => {
    await images.put(`${ID}-original.png`, PNG.buffer.slice(0), { httpMetadata: { contentType: "image/png" } });
    const { GET } = await import("@/app/api/images/[key]/route");
    const ok = await GET(new Request("https://site.test/"), { params: Promise.resolve({ key: `${ID}-original.png` }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toContain("immutable");
    for (const key of ["../secrets", `${ID}-original.png.exe`, `${ID}-no-background.png`]) {
      const res = await GET(new Request("https://site.test/"), { params: Promise.resolve({ key }) });
      expect(res.status, key).toBe(404);
    }
  });
});

describe("/api/health", () => {
  it("counts the emojis and says whether Replicate is connected", async () => {
    const { GET } = await import("@/app/api/health/route");
    expect(await (await GET()).json()).toEqual({ ok: true, emojis: 1, replicate: "not-connected" });
    env.REPLICATE_API_TOKEN = "r8_test";
    expect(await (await GET()).json()).toEqual({ ok: true, emojis: 1, replicate: "connected" });
  });
});
