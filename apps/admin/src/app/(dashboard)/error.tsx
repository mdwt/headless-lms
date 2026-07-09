"use client";

// Route-group error boundary for the whole back-office. Rendered *inside* the
// dashboard layout, so the sidebar chrome stays and only the content area shows
// the failure. Catches anything thrown while rendering a dashboard page —
// including a failed server-side API fetch — instead of letting it 500 the route.
import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error to the console/monitoring; the UI stays generic.
    console.error("dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-base font-medium tracking-tight text-ink">Something went wrong</h1>
        <p className="max-w-[42ch] text-pretty text-sm text-ink-3">
          This page couldn&apos;t be loaded. Try again, or
          head back to the overview.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCw className="size-4" />
          Try again
        </Button>
        <Button variant="secondary" asChild>
          <a href="/">Go to overview</a>
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-ink-4">ref: {error.digest}</p>
      ) : null}
    </div>
  );
}
