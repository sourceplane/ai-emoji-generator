import "server-only"
import { env } from "./env"

/**
 * An emoji as the pages read it: the template's Prisma model, from a row of
 * the `emojis` table (packages/db's 010_emojis migration).
 */
export interface Emoji {
  id: string
  createdAt: Date
  updatedAt: Date
  prompt: string
  isFlagged: boolean
  isFeatured: boolean
  originalUrl: string | null
  noBackgroundUrl: string | null
  safetyRating: number
  error: string | null
}

export interface EmojiRow {
  id: string
  created_at: string
  updated_at: string
  prompt: string
  is_flagged: number
  is_featured: number
  original_url: string | null
  no_background_url: string | null
  safety_rating: number
  error: string | null
}

export function toEmoji(row: EmojiRow): Emoji {
  return {
    id: row.id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    prompt: row.prompt,
    isFlagged: row.is_flagged === 1,
    isFeatured: row.is_featured === 1,
    originalUrl: row.original_url,
    noBackgroundUrl: row.no_background_url,
    safetyRating: row.safety_rating,
    error: row.error,
  }
}

/** The D1 database bound as `DB`. */
export function db(): D1Database {
  return env().DB
}

/** The template's VALID_EMOJI_FILTER: shown in the grid, the sitemap and the count of finished emojis. */
export const VALID_EMOJI_SQL = "is_flagged = 0 AND original_url IS NOT NULL AND no_background_url IS NOT NULL"
