import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

interface FaviconProps {
  /** The emoji (a data URL), or none: a plain white tile. */
  url: string | null
}

export function Favicon({ url }: FaviconProps) {
  return new ImageResponse(
    (
      <div
        style={{
          background: "white",
          width: "100%",
          height: "100%",
          ...(url ? { backgroundImage: `url(${url})` } : {}),
          backgroundSize: `${size.width}px ${size.height}px`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
        }}
      />
    ),
    {
      ...size,
    }
  )
}
