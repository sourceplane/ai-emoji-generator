import path from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `next dev` reaches the D1, R2 and KV bindings through wrangler's local
// platform proxy (render apps/web/wrangler.jsonc first: `pnpm run
// wire:fixture`; apply the migrations: `pnpm db:migrate:local`). The build is
// webpack's (package.json: `next build --webpack`).
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker; traced from the monorepo root.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // The emojis are served from this site's own R2 bucket (/api/images/…);
  // Workers runs no image optimizer, so images are served as they are.
  images: { unoptimized: true },
};

export default nextConfig;
