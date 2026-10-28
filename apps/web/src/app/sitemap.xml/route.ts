import { SITEMAP_PAGE_SIZE } from "@/lib/constants"
import { siteUrl } from "@/lib/site"
import { db, VALID_EMOJI_SQL } from "@/server/db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const row = await db().prepare(`SELECT count(*) AS n FROM emojis WHERE ${VALID_EMOJI_SQL}`).first<{ n: number }>()
  const totalSitemaps = Math.ceil((row?.n ?? 0) / SITEMAP_PAGE_SIZE)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>${siteUrl()}/</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
      </url>
      ${Array.from({ length: totalSitemaps })
        .map(
          (_, index) => `
        <sitemap>
          <loc>${siteUrl()}/api/sitemaps/${index}</loc>
        </sitemap>
      `
        )
        .join("\n")}
    </sitemapindex>
  `

  return new Response(xml, {
    status: 200,
    headers: {
      // Cache for 1 day w/ swr
      "Cache-control": "public, s-maxage=86400, stale-while-revalidate",
      "content-type": "application/xml",
    },
  })
}
