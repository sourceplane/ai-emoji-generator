"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createEmoji } from "./action"
import { SubmitButton } from "./submit-button"
import toast from "react-hot-toast"
import useSWR from "swr"

interface EmojiFormProps {
  initialPrompt?: string
  /** Whether a Replicate account is connected; without one the form explains how to connect it. */
  connected: boolean
}

export function EmojiForm({ initialPrompt, connected }: EmojiFormProps) {
  const [formState, formAction] = useActionState(createEmoji, undefined)
  const submitRef = useRef<React.ElementRef<"button">>(null)
  const [token, setToken] = useState("")

  useEffect(() => {
    if (!formState) return
    toast.error(formState.message)
  }, [formState])

  useSWR(
    connected ? "/api/token" : null,
    async (url: string) => {
      const res = await fetch(url)
      const json = (await res.json()) as { token?: string }
      return json?.token ?? ""
    },
    {
      onSuccess: (token) => setToken(token),
    }
  )

  return (
    <div className="space-y-2">
      <form action={formAction} className="bg-black rounded-xl shadow-lg h-fit flex flex-row px-1 items-center w-full">
        <input
          defaultValue={initialPrompt}
          type="text"
          name="prompt"
          disabled={!connected}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submitRef.current?.click()
            }
          }}
          placeholder="cat"
          className="bg-transparent text-white placeholder:text-gray-400 ring-0 outline-none resize-none py-2.5 px-2 font-mono text-sm h-10 w-full transition-all duration-300"
        />
        <input aria-hidden type="text" name="token" value={token} className="hidden" readOnly />
        <SubmitButton ref={submitRef} disabled={!connected} />
      </form>
      {!connected && (
        <p data-replicate="not-connected" className="text-sm text-gray-500 text-center">
          Not connected to Replicate yet: store a Replicate API token as <code>REPLICATE_API_TOKEN</code> and redeploy to
          start generating emojis.
        </p>
      )}
    </div>
  )
}
