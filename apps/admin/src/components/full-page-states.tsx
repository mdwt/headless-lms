import { Ban, Loader2 } from "lucide-react";

/** Centered full-viewport loader for the auth gate / route transitions. */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page">
      <div className="flex flex-col items-center gap-3 text-ink-3">
        <Loader2 className="size-5 animate-spin text-brand" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

/** Full-page forbidden state for a route a role can't reach. */
export function ForbiddenView({ description }: { description?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <div className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
          <Ban className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight text-ink">Access restricted</h1>
          <p className="text-sm text-ink-3 text-pretty">
            {description ??
              "Your role doesn't permit access to this area. Contact an owner or admin if you need it."}
          </p>
        </div>
      </div>
    </div>
  );
}
