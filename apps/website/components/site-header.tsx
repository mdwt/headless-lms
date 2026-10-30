"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo, GithubIcon } from "@/components/logo";
import { primaryNav, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-line"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <div
        className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-lg"
        aria-hidden="true"
      />
      <div className="container-page flex h-[60px] items-center gap-6">
        <Link href="/" aria-label="Homepage" className="shrink-0 text-foreground">
          <Logo className="text-[19px]" markClassName="size-6" />
        </Link>

        <nav className="ml-4 hidden items-center gap-1 text-[14px] lg:flex" aria-label="Main">
          {primaryNav.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 transition-colors hover:bg-surface hover:text-foreground",
                isActive(item.href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {isActive(item.href) && <span className="dot !size-[5px]" />}
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:inline-flex"
          >
            <GithubIcon className="size-[15px]" />
            GitHub
          </a>
          <span className="mx-1.5 hidden h-4 w-px bg-line md:block" />
          <Link
            href="/docs"
            className="ml-1 inline-flex h-[34px] items-center rounded-[5px] bg-primary px-[13px] text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_82%,var(--background))]"
          >
            Get started
          </Link>
          <button
            type="button"
            className="ml-1 inline-flex size-9 items-center justify-center rounded-[5px] text-foreground hover:bg-surface lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 top-[60px] bottom-0 overflow-y-auto bg-background lg:hidden"
        >
          <nav className="container-page flex flex-col pt-6 pb-10" aria-label="Mobile">
            <div className="border-t border-line">
              {primaryNav.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-line py-4 text-[17px] font-medium tracking-[-0.01em] text-foreground"
                >
                  {item.title}
                  <ArrowRight className="size-4 text-subtle" />
                </Link>
              ))}
              <a
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between border-b border-line py-4 text-[17px] font-medium tracking-[-0.01em] text-foreground"
              >
                GitHub
                <GithubIcon className="size-4 text-subtle" />
              </a>
            </div>
            <Link
              href="/docs"
              onClick={() => setOpen(false)}
              className="mt-6 inline-flex h-[46px] items-center justify-center rounded-[6px] bg-primary text-[15px] font-medium text-primary-foreground"
            >
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
