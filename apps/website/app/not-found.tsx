import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { primaryNav } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-24 sm:px-6">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          The page you are looking for has moved or never existed.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} className="text-primary hover:underline">
              {item.title}
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
