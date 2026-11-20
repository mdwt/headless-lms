// Branded 404 — rendered for unknown URLs and `notFound()` calls (e.g. the
// course player when the course or its modules can't be fetched).
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appAtDomain } from "@/lib/app";

async function servesCourses(): Promise<boolean> {
  try {
    return (await appAtDomain())?.app.courses ?? false;
  } catch (e) {
    unstable_rethrow(e);
    return false;
  }
}

export default async function NotFound() {
  const hasCourses = await servesCourses();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center px-7 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
        <SearchX className="size-7" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.01em]">Page not found</h1>
      <p className="mb-[26px] text-[15.5px] leading-[1.6] text-ink-2">
        This page doesn&apos;t exist, or you no longer have access to it.
      </p>
      {hasCourses && (
        <Button variant="brand" size="pillSm" asChild>
          <Link href="/">Back to my courses</Link>
        </Button>
      )}
    </main>
  );
}
