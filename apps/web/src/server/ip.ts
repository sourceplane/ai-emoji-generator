import "server-only"

/** The visitor's address, as Cloudflare saw it (the template read Vercel's `request.ip`). */
export function visitorIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1"
}
