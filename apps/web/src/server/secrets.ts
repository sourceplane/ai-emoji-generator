import "server-only"
import { db } from "./db"
import { env } from "./env"

const cache = new Map<string, string>()

/**
 * The secret the site signs with, generated once per database by the
 * `020_app_secrets` migration. An API_SECRET Worker secret wins.
 */
export async function appSecret(name: "api"): Promise<string> {
  const fromEnv = env().API_SECRET
  if (fromEnv) return fromEnv
  const hit = cache.get(name)
  if (hit) return hit
  const row = await db().prepare("SELECT value FROM app_secrets WHERE name = ?").bind(name).first<{ value: string }>()
  if (!row) throw new Error(`No "${name}" secret in app_secrets: apply the migrations first`)
  cache.set(name, row.value)
  return row.value
}
