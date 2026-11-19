import type { ReactNode } from "react";

import { requireCourseApp } from "@/lib/app";

/**
 * Split-panel shell for the unauthenticated surfaces (invite landing, password
 * reset, sign-in link). It carries the name of the organization whose domain
 * this is, and answers 404 on a domain that is no course app's.
 *
 * Server component: it is pure layout and copy, so none of it ships to the
 * browser. Pages compose it and drop a client island into `children` only where
 * interactivity is genuinely needed.
 */
export async function AuthShell({ children }: { children: ReactNode }) {
  const { organization } = await requireCourseApp();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-ink">{organization.name}</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Your courses, in one calm place. Pick up right where you left off.
            </p>
            <footer className="mt-4 text-sm text-surface/60">{organization.name}</footer>
          </blockquote>
        </div>
      </aside>
    </div>
  );
}
