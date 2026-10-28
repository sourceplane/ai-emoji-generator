import Replicate from "replicate"
import "server-only"
import { EMOJI_SIZE } from "../lib/constants"
import { siteUrl } from "../lib/site"
import { env } from "./env"
import { appSecret } from "./secrets"
import { webhookToken } from "./webhook"

/** Whether a Replicate account is connected (its API token stored as REPLICATE_API_TOKEN). */
export function replicateConnected(): boolean {
  return Boolean(env().REPLICATE_API_TOKEN)
}

export const NOT_CONNECTED_MESSAGE =
  "This site isn't connected to Replicate yet. Store a Replicate API token as REPLICATE_API_TOKEN and redeploy (the README's \"Connecting Replicate\")."

export class ReplicateClient {
  replicate: Replicate

  constructor({ auth, baseUrl }: { auth: string; baseUrl?: string }) {
    // Unset, the client talks to Replicate itself; the offline tests point it at a local stand-in.
    this.replicate = new Replicate({ auth, ...(baseUrl ? { baseUrl } : {}) })
  }

  private async webhook(stage: "remove-background" | "save-emoji", id: string) {
    const webhook = new URL(`${siteUrl()}/api/webhook/${stage}`)
    webhook.searchParams.set("id", id)
    webhook.searchParams.set("token", await webhookToken(await appSecret("api"), stage, id))
    return webhook.toString()
  }

  async createEmoji({ id, prompt }: { id: string; prompt: string }) {
    return this.replicate.predictions.create({
      version: "dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e",
      input: {
        prompt: `A TOK emoji of a ${prompt}`,
        width: EMOJI_SIZE,
        height: EMOJI_SIZE,
        num_inference_steps: 30,
        // prompt_strength: 0.8,
        negative_prompt: "racist, xenophobic, antisemitic, islamophobic, bigoted",
      },
      webhook: await this.webhook("remove-background", id),
      webhook_events_filter: ["completed"],
    })
  }

  async removeBackground({ id, image }: { id: string; image: string }) {
    return this.replicate.predictions.create({
      version: "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      input: {
        image,
      },
      webhook: await this.webhook("save-emoji", id),
      webhook_events_filter: ["completed"],
    })
  }

  async classifyPrompt({ prompt: _prompt }: { prompt: string }): Promise<number> {
    const prompt = `[PROMPT] ${_prompt} [/PROMPT] [SAFETY_RANKING]`

    const output = await this.replicate.run(
      "fofr/prompt-classifier:1ffac777bf2c1f5a4a5073faf389fefe59a8b9326b3ca329e9d576cce658a00f",
      {
        input: {
          prompt,
          max_new_tokens: 128,
          temperature: 0.2,
          top_p: 0.9,
          top_k: 50,
          stop_sequences: "[/SAFETY_RANKING]",
        },
      }
    )

    const safetyRating = Number((output as string[] | undefined)?.join("").trim())
    return safetyRating || 0
  }

  /** The account's webhook signing secret (`whsec_…`), read once per isolate. */
  async webhookSecret(): Promise<string> {
    const { key } = await this.replicate.webhooks.default.secret.get()
    return key
  }
}

const secrets = new Map<string, Promise<string>>()

/** The client for this request's environment; only call it when replicateConnected(). */
export function replicate(): ReplicateClient {
  const { REPLICATE_API_TOKEN, REPLICATE_API_BASE } = env()
  if (!REPLICATE_API_TOKEN) throw new Error(NOT_CONNECTED_MESSAGE)
  return new ReplicateClient({ auth: REPLICATE_API_TOKEN, baseUrl: REPLICATE_API_BASE })
}

/** The signing secret webhooks are verified with: REPLICATE_WEBHOOK_SECRET, or the account's own. */
export async function replicateWebhookSecret(): Promise<string> {
  const { REPLICATE_WEBHOOK_SECRET, REPLICATE_API_TOKEN = "" } = env()
  if (REPLICATE_WEBHOOK_SECRET) return REPLICATE_WEBHOOK_SECRET
  let hit = secrets.get(REPLICATE_API_TOKEN)
  if (!hit) {
    hit = replicate().webhookSecret()
    hit.catch(() => secrets.delete(REPLICATE_API_TOKEN))
    secrets.set(REPLICATE_API_TOKEN, hit)
  }
  return hit
}
