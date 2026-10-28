import { readFileSync } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("site identity (apps/web/src/lib/site.ts)", () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
  });

  it("names the site and links its source repository", async () => {
    const { SITE_NAME, SOURCE_URL } = await import("@/lib/site");
    expect(SITE_NAME.trim()).not.toBe("");
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[a-z0-9-]+$/);
  });

  it("builds on the environment's origin, without a trailing slash", async () => {
    const { siteUrl } = await import("@/lib/site");
    process.env.NEXT_PUBLIC_SITE_URL = "https://emojis.example.com/";
    expect(siteUrl()).toBe("https://emojis.example.com");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("the site's name and source link reach the pages", () => {
  const web = (f: string) => readFileSync(path.resolve(__dirname, "../../../apps/web/src", f), "utf8");
  it("titles every page, the heading and the header with SITE_NAME", () => {
    expect(web("app/layout.tsx")).toContain("const title = SITE_NAME");
    expect(web("app/layout.tsx")).toContain("<span>{SITE_NAME}</span>");
    expect(web("app/_components/page-content/index.tsx")).toContain("{SITE_NAME}");
  });
  it("links the site's own repository from the header", () => {
    expect(web("app/layout.tsx")).toContain("href={SOURCE_URL}");
  });
});
