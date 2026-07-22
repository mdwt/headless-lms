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
        'group/code overflow-hidden rounded-2xl border border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-secondary/40 px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <span>{filename ?? language}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code to clipboard"
          className="relative inline-flex size-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <span
            className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
            aria-hidden="true"
          />
          {copied ? (
            <Check className="size-4 text-primary" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm/6 text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  )
}
