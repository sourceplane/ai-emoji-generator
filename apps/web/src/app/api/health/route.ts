import { db } from "@/server/db"
import { replicateConnected } from "@/server/replicate"

// The deploy's smoke test and the deployment record's probe: proves the
// Worker serves, its D1 binding answers and the migrations ran (the emojis
// table is there), and says whether a Replicate account is connected.
export const dynamic = "force-dynamic"

export async function GET() {
  const row = await db().prepare("SELECT count(*) AS emojis FROM emojis").first<{ emojis: number }>()
  return Response.json({
    ok: true,
    emojis: row?.emojis ?? 0,
    replicate: replicateConnected() ? "connected" : "not-connected",
  })
}
