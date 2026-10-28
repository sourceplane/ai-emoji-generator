"use server"

import { nanoid } from "@/lib/utils"
import { createEmojiRow } from "@/server/emojis"
import { limit } from "@/server/ratelimit"
import { NOT_CONNECTED_MESSAGE, replicate, replicateConnected } from "@/server/replicate"
import { appSecret } from "@/server/secrets"
import { jwtVerify } from "jose"
import { redirect } from "next/navigation"
import { z } from "zod"

const jwtSchema = z.object({
  ip: z.string(),
})

interface FormState {
  message: string
}

export async function createEmoji(prevFormState: FormState | undefined, formData: FormData): Promise<FormState | undefined> {
  const prompt = (formData.get("prompt") as string | null)?.trim().replaceAll(":", "")
  const token = formData.get("token") as string | null

  if (!prompt) return // no need to display an error message for blank prompts
  if (!replicateConnected()) return { message: NOT_CONNECTED_MESSAGE }
  const id = nanoid()

  try {
    const verified = await jwtVerify(token ?? "", new TextEncoder().encode(await appSecret("api")))
    const { ip } = jwtSchema.parse(verified.payload)

    const { success } = await limit(ip)
    if (!success) return { message: "Daily limit reached, try again tomorrow." }

    const client = replicate()
    const safetyRating = await client.classifyPrompt({ prompt })
    const data = { id, prompt, safetyRating }

    if (safetyRating >= 9) {
      await createEmojiRow({ ...data, isFlagged: true })
      return { message: "Nice try! Your prompt is inappropriate, let's keep it PG." }
    }

    // The row first: Replicate's webhook for this prediction finds it.
    await createEmojiRow(data)
    await client.createEmoji(data)
  } catch (error) {
    console.error(error)
    return { message: "Connection error, please refresh the page." }
  }

  redirect(`/p/${id}`)
}
