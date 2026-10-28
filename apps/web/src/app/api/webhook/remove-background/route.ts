import { getEmoji } from "@/server/get-emoji"
import { updateEmojiRow } from "@/server/emojis"
import { putImage } from "@/server/images"
import { replicate, replicateConnected, replicateWebhookSecret } from "@/server/replicate"
import { appSecret } from "@/server/secrets"
import { Response, webhookSchema } from "@/server/utils"
import { timingSafeEqual, verifyReplicateWebhook, webhookToken } from "@/server/webhook"

export async function POST(req: Request) {
  try {
    if (!replicateConnected()) return Response.notConnected()

    const searchParams = new URL(req.url).searchParams
    const parsedParams = webhookSchema.safeParse(Object.fromEntries(searchParams))
    if (!parsedParams.success) return Response.invalidRequest(parsedParams.error)
    const { id, token } = parsedParams.data

    // Replicate's signature over the body, then this URL's own token for this emoji and stage.
    const raw = await req.text()
    if (!(await verifyReplicateWebhook(req.headers, raw, await replicateWebhookSecret()))) return Response.unauthorized()
    if (!timingSafeEqual(token, await webhookToken(await appSecret("api"), "remove-background", id))) {
      return Response.unauthorized()
    }
    if (!(await getEmoji(id))) return Response.emojiNotFound()

    // get output from Replicate
    const body = JSON.parse(raw)
    const { output, error } = body

    if (typeof error === "string") {
      await updateEmojiRow(id, { isFlagged: true, error })
      return Response.success()
    }

    if (!output) return Response.badRequest("Missing output")

    // fetch the image Replicate made
    const file = await fetch(output[0]).then((res) => res.arrayBuffer())

    // upload & store image
    const url = await putImage(`${id}-original.png`, file)

    // update emoji
    await updateEmojiRow(id, { originalUrl: url })

    const res = await replicate().removeBackground({ id, image: output[0] })
    console.log(res.id)

    return Response.success()
  } catch (error) {
    console.error(error)
    return Response.internalServerError()
  }
}
