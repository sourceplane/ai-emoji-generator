import "server-only"
import { db, VALID_EMOJI_SQL } from "./db"

type Listed = { id: string; updatedAt: Date }

/**
 * The template's full-text search phrase for a prompt: its words, each
 * quoted (so no FTS5 operator a visitor types is interpreted), any of them.
 */
export function ftsQuery(prompt: string): string | null {
  const words = prompt.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.length === 0) return null
  return words.map((w) => `"${w}"`).join(" OR ")
}

/**
 * Finished emojis, newest first (or oldest first, for the sitemap). With a
 * `prompt`, the template ordered every emoji by its prompt's full-text
 * relevance; here the matches come first, best first (bm25 over emojis_fts),
 * and the newest of the rest fill the grid up to `take`.
 */
export const getEmojis = async (opts: { take?: number; skip?: number; order?: "newest" | "oldest"; prompt?: string }) => {
  const take = opts.take ?? 100
  const skip = opts.skip ?? 0
  const order = opts.order === "oldest" ? "ASC" : "DESC"
  const toListed = (r: { id: string; updated_at: string }): Listed => ({ id: r.id, updatedAt: new Date(r.updated_at) })

  const match = opts.prompt ? ftsQuery(opts.prompt) : null
  if (!match) {
    const { results } = await db()
      .prepare(`SELECT id, updated_at FROM emojis WHERE ${VALID_EMOJI_SQL} ORDER BY created_at ${order} LIMIT ? OFFSET ?`)
      .bind(take, skip)
      .all<{ id: string; updated_at: string }>()
    return results.map(toListed)
  }

  const { results: related } = await db()
    .prepare(
      `SELECT e.id, e.updated_at FROM emojis_fts f JOIN emojis e ON e.id = f.id
       WHERE emojis_fts MATCH ? AND ${VALID_EMOJI_SQL.replaceAll(/\b(is_flagged|original_url|no_background_url)\b/g, "e.$1")}
       ORDER BY bm25(emojis_fts), e.created_at DESC LIMIT ?`
    )
    .bind(match, take)
    .all<{ id: string; updated_at: string }>()
  if (related.length >= take) return related.map(toListed)

  const seen = new Set(related.map((r) => r.id))
  const { results: recent } = await db()
    .prepare(`SELECT id, updated_at FROM emojis WHERE ${VALID_EMOJI_SQL} ORDER BY created_at DESC LIMIT ?`)
    .bind(take)
    .all<{ id: string; updated_at: string }>()
  return [...related, ...recent.filter((r) => !seen.has(r.id))].slice(0, take).map(toListed)
}
