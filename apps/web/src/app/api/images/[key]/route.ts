import { env } from "@/server/env"
import { IMAGE_KEY } from "@/server/images"

// The emojis' images, from the private R2 bucket (the template linked straight
// to public Vercel Blob URLs). A key is written once and never changes.
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!IMAGE_KEY.test(key)) return new Response("Not found", { status: 404 })
  const object = await env().IMAGES.get(key)
  if (!object) return new Response("Not found", { status: 404 })
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  })
}
