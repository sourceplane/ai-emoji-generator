import { OpenGraphImage } from "@/app/_components/opengraph-image"
import { SITE_NAME } from "@/lib/site"
import { getEmoji } from "@/server/get-emoji"
import { imageDataUrl } from "@/server/images"
import { EmojiContextProps } from "@/server/utils"

export { contentType, size } from "@/app/_components/opengraph-image"

export default async function Image({ params }: EmojiContextProps) {
  const data = await getEmoji((await params).id)
  const url = (await imageDataUrl(data?.noBackgroundUrl)) ?? (await imageDataUrl(data?.originalUrl))
  return OpenGraphImage({ url, title: SITE_NAME })
}
