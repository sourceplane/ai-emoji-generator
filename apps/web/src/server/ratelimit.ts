import "server-only"
import { DAILY_LIMIT } from "../lib/constants"
import { env } from "./env"

/**
 * The template's free limit (Upstash's sliding window over Vercel KV, 500 a
 * day per visitor) as a per-visitor, per-UTC-day counter in Workers KV. KV is
 * eventually consistent, so concurrent requests from one visitor can each
 * read the same count: the limit holds approximately, as a cost guard, not to
 * the request.
 */
export async function limit(ip: string): Promise<{ success: boolean; remaining: number }> {
  const max = Number(env().RATE_LIMIT_PER_DAY) || DAILY_LIMIT
  const key = `ratelimit:${new Date().toISOString().slice(0, 10)}:${ip}`
  const kv = env().RATE_LIMIT
  const used = Number(await kv.get(key)) || 0
  if (used >= max) return { success: false, remaining: 0 }
  await kv.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 })
  return { success: true, remaining: max - used - 1 }
}
