import { visitorIp } from "@/server/ip"
import { appSecret } from "@/server/secrets"
import { Response } from "@/server/utils"
import { SignJWT } from "jose"
import { nanoid } from "nanoid"
import { type NextRequest } from "next/server"

export const revalidate = 0

export async function GET(request: NextRequest) {
  const ip = visitorIp(request.headers)

  const token = await new SignJWT({ ip })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(nanoid())
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(new TextEncoder().encode(await appSecret("api")))

  return Response.success({ body: { token } })
}
