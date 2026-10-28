import { EmojiCard } from "@/app/_components/emoji-card"
import { PageContent } from "@/app/_components/page-content"
import { SITE_NAME } from "@/lib/site"
import { formatPrompt } from "@/lib/utils"
import { getEmoji } from "@/server/get-emoji"
import { EmojiContextProps } from "@/server/utils"
import { Metadata } from "next"
import { redirect } from "next/navigation"

export async function generateMetadata({ params }: EmojiContextProps): Promise<Metadata | undefined> {
  const data = await getEmoji((await params).id)
  if (!data) return

  const title = `${formatPrompt(data.prompt)} | ${SITE_NAME}`
  const description = `An emoji generated from the prompt: ${data.prompt}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function Emoji({ params }: EmojiContextProps) {
  const { id } = await params
  const data = await getEmoji(id)
  if (!data) redirect("/")

  return (
    <PageContent prompt={data.prompt}>
      <EmojiCard id={id} alwaysShowDownloadBtn />
    </PageContent>
  )
}
