import type { ReactNode } from "react";

export function AuthHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">{title}</h1>
      <p className="text-sm text-ink-3 text-pretty">{children}</p>
    </div>
  );
}
