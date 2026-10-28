import "server-only"
import { db } from "./db"

export const getEmojisCount = async () => {
  const row = await db().prepare("SELECT count(*) AS n FROM emojis").first<{ n: number }>()
  return row?.n ?? 0
}
