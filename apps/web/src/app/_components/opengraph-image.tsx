import { ImageResponse } from "next/og"

const EMOJI_SIZE = 570
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

interface OpenGraphImageProps {
  /** The emoji to show (a data URL), or none: the card shows the site's name. */
  url: string | null
  title: string
}

export function OpenGraphImage({ url, title }: OpenGraphImageProps) {
  return new ImageResponse(
    (
      <div
        style={{
          backgroundColor: "white",
          height: "100%",
          width: "100%",
          display: "flex",
          textAlign: "center",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          flexWrap: "nowrap",
        }}
      >
        {url ? (
          <img alt="" height={EMOJI_SIZE} src={url} width={EMOJI_SIZE} />
        ) : (
          <div style={{ fontSize: 72, fontWeight: 600, color: "black" }}>{title}</div>
        )}
      </div>
    ),
    { ...size }
  )
}
