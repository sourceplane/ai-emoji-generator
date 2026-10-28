import "server-only"
import { db } from "./db"

/** A new emoji row and its full-text index entry, in one batch. */
export async function createEmojiRow(data: { id: string; prompt: string; safetyRating: number; isFlagged?: boolean }) {
  await db().batch([
    db()
      .prepare("INSERT INTO emojis (id, prompt, safety_rating, is_flagged) VALUES (?, ?, ?, ?)")
      .bind(data.id, data.prompt, data.safetyRating, data.isFlagged ? 1 : 0),
    db().prepare("INSERT INTO emojis_fts (id, prompt) VALUES (?, ?)").bind(data.id, data.prompt),
  ])
}

type Patch = Partial<{
  isFlagged: boolean
  error: string | null
  originalUrl: string
  noBackgroundUrl: string
}>

const COLUMN: Record<keyof Patch, string> = {
  isFlagged: "is_flagged",
  error: "error",
  originalUrl: "original_url",
  noBackgroundUrl: "no_background_url",
}

/** The template's `prisma.emoji.update({ where: { id }, data })`, with `updatedAt` kept current. */
export async function updateEmojiRow(id: string, patch: Patch) {
  const entries = Object.entries(patch) as [keyof Patch, Patch[keyof Patch]][]
  if (entries.length === 0) return
  const sets = entries.map(([k]) => `${COLUMN[k]} = ?`)
  const values = entries.map(([k, v]) => (k === "isFlagged" ? (v ? 1 : 0) : (v ?? null)))
  await db()
    .prepare(`UPDATE emojis SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .bind(...values, id)
    .run()
}
