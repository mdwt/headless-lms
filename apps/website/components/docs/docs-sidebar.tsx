'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { docsNav } from '@/lib/docs'
import { cn } from '@/lib/utils'

export function DocsSidebar() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-6" aria-label="Documentation">
      {docsNav.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-sm font-semibold text-foreground">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
