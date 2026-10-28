import { OpenGraphImage } from "@/app/_components/opengraph-image"
import { SITE_NAME } from "@/lib/site"
import { getEmojis } from "@/server/get-emojis"
import { getEmoji } from "@/server/get-emoji"
import { imageDataUrl } from "@/server/images"

export { contentType, size } from "@/app/_components/opengraph-image"

export const dynamic = "force-dynamic"

// The newest finished emoji (the template picked one of its own featured
// emojis, hosted on its author's storage), or the site's name on a new site.
export default async function Image() {
  const [latest] = await getEmojis({ take: 1 })
  const emoji = latest ? await getEmoji(latest.id) : null
  return OpenGraphImage({ url: await imageDataUrl(emoji?.noBackgroundUrl), title: SITE_NAME })
}
