import "server-only"
import { env } from "./env"

/** The keys the site writes: `<emoji id>-original.png` and `<emoji id>-no-background.png`. */
export const IMAGE_KEY = /^[0-9A-Za-z]{7,10}-(original|no-background)\.png$/

/** The site's own path for an image in the R2 bucket (served by /api/images/[key]). */
export const imagePath = (key: string) => `/api/images/${key}`

/** The template's `put(…, { access: "public" })` to Vercel Blob, as an R2 put. */
export async function putImage(key: string, body: ArrayBuffer) {
  if (!IMAGE_KEY.test(key)) throw new Error(`not an image key: ${key}`)
  await env().IMAGES.put(key, body, { httpMetadata: { contentType: "image/png" } })
  return imagePath(key)
}

/** An image's bytes as a data URL, for the Open Graph cards and favicons (null when absent). */
export async function imageDataUrl(path: string | null | undefined): Promise<string | null> {
  const key = path?.startsWith("/api/images/") ? path.slice("/api/images/".length) : null
  if (!key || !IMAGE_KEY.test(key)) return null
  const object = await env().IMAGES.get(key)
  if (!object) return null
  const bytes = new Uint8Array(await object.arrayBuffer())
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/png;base64,${btoa(bin)}`
}
