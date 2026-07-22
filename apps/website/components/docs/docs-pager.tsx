import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type PagerLink = { title: string; href: string }

export function DocsPager({
  prev,
  next,
}: {
  prev?: PagerLink
  next?: PagerLink
}) {
  return (
    <div className="mt-14 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            Previous
          </span>
          <span className="mt-1 text-sm font-medium text-foreground">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 sm:col-start-2"
        >
          <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            Next
            <ArrowRight className="size-3.5" />
          </span>
          <span className="mt-1 text-sm font-medium text-foreground">
            {next.title}
          </span>
        </Link>
      ) : null}
    </div>
  )
}
