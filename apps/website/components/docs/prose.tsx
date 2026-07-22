import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function DocHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <header className="mb-10 border-b border-border/70 pb-8">
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  )
}

export function Prose({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'space-y-4 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_code]:rounded [&_code]:bg-card [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground/90 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-foreground [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:text-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}
