// The site's identity, written once. The title, the header, the Open Graph
// card and the web manifest read SITE_NAME; the header's source link is
// SOURCE_URL. A product built from this baseline gets both rewritten to its
// own name and repository at instantiation, so keep them literal and on one
// line each.
export const SITE_NAME = "AI Emoji Generator"
export const SOURCE_URL = "https://github.com/sourceplane/ai-emoji-generator"

/**
 * This environment's public origin, no trailing slash. Each build sets
 * NEXT_PUBLIC_SITE_URL to its environment's SITE_URL (intent.yaml) or its
 * workers.dev URL (component.yaml's buildCommand); Replicate delivers its
 * webhooks here, and the sitemap and Open Graph links are built on it.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "")
}
