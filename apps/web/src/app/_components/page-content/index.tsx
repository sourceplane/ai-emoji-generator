import { SITE_NAME } from "@/lib/site"
import { replicateConnected } from "@/server/replicate"
import { Suspense } from "react"
import { EmojiCount } from "../emoji-count"
import { EmojiForm } from "../emoji-form"
import { EmojiGrid } from "../emoji-grid"

interface PageContentProps extends React.PropsWithChildren {
  prompt?: string
}

export const PageContent = ({ children, prompt }: PageContentProps) => {
  return (
    <>
      <div className="py-[15vh] sm:py-[20vh] flex flex-col items-center justify-center">
        <h1 className="font-medium text-4xl text-black mb-3 animate-in fade-in slide-in-from-bottom-3 duration-1000 ease-in-out">
          {SITE_NAME}
        </h1>
        <EmojiCount />

        <div className="max-w-md space-y-4 w-full animate-in fade-in slide-in-from-bottom-4 duration-1200 ease-in-out">
          <EmojiForm initialPrompt={prompt} connected={replicateConnected()} />
          {children}
        </div>
      </div>

      <Suspense>
        <EmojiGrid prompt={prompt} />
      </Suspense>
    </>
  )
}
