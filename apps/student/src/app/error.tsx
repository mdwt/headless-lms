"use client";

// Root error boundary — catches anything thrown while rendering a student page
// (including failed server-side API fetches) instead of letting it 500 the
// route. Rendered inside the root layout, so fonts and tokens still apply.
import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error to the console/monitoring; the UI stays generic.
    console.error("route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center px-7 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
        <TriangleAlert className="size-7" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.01em]">Something went wrong</h1>
      <p className="mb-[26px] text-[15.5px] leading-[1.6] text-ink-2">
        This page couldn&apos;t be loaded. Try again, or head back to your courses.
      </p>
      <div className="flex items-center gap-2.5">
        <Button variant="brand" size="pillSm" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghostOutline" size="pillSm" asChild>
          <Link href="/">Back to my courses</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="mt-6 font-mono text-xs text-ink-4">ref: {error.digest}</p>
      ) : null}
    </main>
  );
}
