'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo, GithubIcon } from '@/components/logo'
import { primaryNav, siteConfig } from '@/lib/site'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-6 text-primary" />
            <span className="text-base font-semibold tracking-tight">
              Headless LMS
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {primaryNav.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" render={<a href={siteConfig.githubUrl} target="_blank" rel="noreferrer" />}>
            <GithubIcon className="size-4" />
            GitHub
          </Button>
          <Button size="sm" render={<Link href="/docs" />}>
            Get started
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/70 bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
            {primaryNav.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.title}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="outline" render={<a href={siteConfig.githubUrl} target="_blank" rel="noreferrer" />}>
                <GithubIcon className="size-4" />
                GitHub
              </Button>
              <Button render={<Link href="/docs" onClick={() => setOpen(false)} />}>
                Get started
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
