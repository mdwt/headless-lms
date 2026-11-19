import Link from "next/link";

export function BackToSignIn() {
  return (
    <p className="mt-6 text-center text-sm text-ink-3">
      <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
