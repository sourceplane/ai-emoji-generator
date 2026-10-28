import { SITEMAP_PAGE_SIZE } from "@/lib/constants"
import { siteUrl } from "@/lib/site"
import { getEmojis } from "@/server/get-emojis"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request, { params }: { params: Promise<{ page: string }> }) {
  const page = Number((await params).page)
  if (!Number.isInteger(page) || page < 0) return new Response("Not found", { status: 404 })
  const emojis = await getEmojis({
    take: SITEMAP_PAGE_SIZE,
    skip: page * SITEMAP_PAGE_SIZE,
    order: "oldest",
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${emojis
      .map(
        (emoji) => `
      <url>
        <loc>${siteUrl()}/p/${emoji.id}</loc>
        <lastmod>${emoji.updatedAt.toISOString()}</lastmod>
      </url>
    `
      )
      .join("\n")}
  </urlset>`

  return new Response(xml, {
    status: 200,
    headers: {
      // Cache for 1 day w/ swr
      "Cache-control": "public, s-maxage=86400, stale-while-revalidate",
      "content-type": "application/xml",
    },
  })
}
