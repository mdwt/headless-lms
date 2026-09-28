import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";

// Shared by the signed-out pages: the form on a solid surface column, a calm dark
// panel beside it from `lg:` up. Each page supplies only its heading, its form,
// and the link to the other one.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <Logo org="Headless LMS" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Everything your team needs to run courses — content and entitlements in one calm
              place.
            </p>
            <footer className="mt-4 text-sm text-surface/60">
              Headless LMS · Management dashboard
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
