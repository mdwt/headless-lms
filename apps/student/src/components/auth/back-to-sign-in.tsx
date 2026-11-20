import Link from "next/link";

import { withNext } from "@/lib/next-path";

export function BackToSignIn({ next }: { next: string | null }) {
  return (
    <p className="mt-6 text-center text-sm text-ink-3">
      <Link
        href={withNext("/login", next)}
        className="font-medium text-brand underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </p>
  );
}
