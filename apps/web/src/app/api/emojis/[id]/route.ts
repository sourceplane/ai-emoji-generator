import { getEmoji } from "@/server/get-emoji"
import { EmojiContextProps, Response } from "@/server/utils"
import { NextResponse } from "next/server"

export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(request: Request, { params }: EmojiContextProps) {
  try {
    const { id } = await params
    const emoji = await getEmoji(id)
    if (!emoji) return Response.emojiNotFound()

    return NextResponse.json({ emoji }, { status: 200 })
  } catch (error) {
    console.error(error)
    return Response.internalServerError()
  }
}
