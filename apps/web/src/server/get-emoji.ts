import "server-only"
import { db, toEmoji, type EmojiRow } from "./db"

export const getEmoji = async (id: string) => {
  const row = await db().prepare("SELECT * FROM emojis WHERE id = ?").bind(id).first<EmojiRow>()
  return row ? toEmoji(row) : null
}
