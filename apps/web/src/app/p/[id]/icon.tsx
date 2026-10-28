import { Favicon } from "@/app/_components/favicon"
import { getEmoji } from "@/server/get-emoji"
import { imageDataUrl } from "@/server/images"
import { EmojiContextProps } from "@/server/utils"

export { contentType, size } from "@/app/_components/favicon"

export default async function Icon({ params }: EmojiContextProps) {
  const data = await getEmoji((await params).id)
  const url = await imageDataUrl(data?.noBackgroundUrl)
  // No finished image yet (or no such emoji): a plain white tile.
  return Favicon({ url })
}
