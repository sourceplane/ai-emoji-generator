import "server-only"

/**
 * Replicate signs every webhook delivery the Standard Webhooks way: the
 * headers `webhook-id`, `webhook-timestamp` (seconds) and `webhook-signature`
 * (space-separated `v1,<base64>`), the signature an HMAC-SHA256 of
 * `${id}.${timestamp}.${body}` keyed by the account's signing secret
 * (`whsec_<base64>`). A delivery is accepted only with a matching signature
 * and a timestamp within five minutes, compared in constant time, before
 * anything in it is read. The template checked a secret it put in plain text
 * in the webhook's query string instead.
 */
export const TOLERANCE_SECONDS = 5 * 60

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ""
  for (const b of u8) bin += String.fromCharCode(b)
  return btoa(bin)
}

function signingKey(secret: string): Uint8Array<ArrayBuffer> {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret
  return fromBase64(raw)
}

/** Constant-time comparison of two strings (their lengths are not secret). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i += 1) diff |= ea[i]! ^ eb[i]!
  return diff === 0
}

async function hmacBase64(key: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return toBase64(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)))
}

export async function signReplicateWebhook(secret: string, id: string, timestamp: number, body: string): Promise<string> {
  return `v1,${await hmacBase64(signingKey(secret), `${id}.${timestamp}.${body}`)}`
}

export async function verifyReplicateWebhook(
  headers: Headers,
  body: string,
  secret: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  const id = headers.get("webhook-id")
  const timestamp = headers.get("webhook-timestamp")
  const signatures = headers.get("webhook-signature")
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false
  let expected: string
  try {
    expected = await signReplicateWebhook(secret, id, Number(timestamp), body)
  } catch {
    return false // a signing secret that is not base64
  }
  let ok = false
  for (const candidate of signatures.split(" ")) {
    if (candidate.startsWith("v1,") && timingSafeEqual(candidate, expected)) ok = true
  }
  return ok
}

/**
 * The webhook URL's own token: an HMAC of the stage and the emoji's id under
 * the site's API secret, so a signed delivery for one emoji cannot be replayed
 * onto another (the URL is not part of what Replicate signs).
 */
export async function webhookToken(apiSecret: string, stage: "remove-background" | "save-emoji", id: string) {
  const b64 = await hmacBase64(new TextEncoder().encode(apiSecret), `${stage}:${id}`)
  return b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
