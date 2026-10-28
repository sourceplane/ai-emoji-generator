// The bindings wrangler.jsonc declares, as the Worker (and `next dev` through
// the platform proxy) sees them, and the secrets and vars the Worker reads.
interface CloudflareEnv {
  /** The emojis and the generated API secret (Cloudflare D1). */
  DB: D1Database;
  /** The generated images (Cloudflare R2), served by /api/images/[key]. */
  IMAGES: R2Bucket;
  /** The per-visitor daily rate limit (Workers KV). */
  RATE_LIMIT: KVNamespace;
  ASSETS: Fetcher;
  /** Replicate's API token: without it the site serves but generates nothing. */
  REPLICATE_API_TOKEN?: string;
  /** Replicate's webhook signing secret. Unset, it is read from Replicate's API. */
  REPLICATE_WEBHOOK_SECRET?: string;
  /** Test-only: where the Replicate client sends its requests (a local stand-in). */
  REPLICATE_API_BASE?: string;
  /** Generations a visitor may start per UTC day (default 500, the template's). */
  RATE_LIMIT_PER_DAY?: string;
  /** Signs the rate-limit tokens. Unset, the one generated in D1 is used. */
  API_SECRET?: string;
}
