import { NextResponse } from "next/server"
import "server-only"
import { ZodError, z } from "zod"
import { NOT_CONNECTED_MESSAGE } from "./replicate"

export class Response {
  static success<JsonBody>(props?: { body?: JsonBody; headers?: HeadersInit }) {
    const { headers } = props ?? {}
    const body = props?.body ?? { ok: true }
    return NextResponse.json(body, { status: 200, headers })
  }

  static internalServerError() {
    return NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 })
  }

  static unauthorized() {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 403 })
  }

  static emojiNotFound() {
    return NextResponse.json({ error: { message: "Emoji not found" } }, { status: 404 })
  }

  static badRequest(message: string) {
    return NextResponse.json({ error: { message } }, { status: 400 })
  }

  static invalidRequest(zodError: ZodError) {
    return NextResponse.json({ error: { message: "Invalid request", details: zodError } }, { status: 400 })
  }

  static tooManyRequests({ headers }: { headers?: HeadersInit }) {
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429, headers })
  }

  static notConnected() {
    return NextResponse.json({ error: { message: NOT_CONNECTED_MESSAGE } }, { status: 503 })
  }
}

export const webhookSchema = z.object({
  id: z.string().length(7).or(z.string().length(10)),
  token: z.string().min(1),
})

export type EmojiContextProps = { params: Promise<{ id: string }> }
