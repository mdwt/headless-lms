'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type CodeBlockProps = {
  code: string
  language?: string
  filename?: string
  className?: string
}

export function CodeBlock({
  code,
  language = 'bash',
  filename,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div
      className={cn(
        'group/code overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-secondary/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          {filename ? (
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {filename}
            </span>
          ) : (
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {language}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code to clipboard"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? (
            <Check className="size-4 text-primary" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  )
}
