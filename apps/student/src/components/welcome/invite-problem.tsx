import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading } from "@/components/auth/auth-heading";

/**
 * Terminal state for a link that can't be acted on — no token in the URL, or a
 * token the API rejected. Server-rendered: there is nothing to interact with.
 */
export function InviteProblem({ message }: { message: string }) {
  return (
    <>
      <AuthHeading title="Invitation not found" />
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <p className="mt-4 text-sm text-ink-3 text-pretty">
        Ask your course admin to send a new invitation.
      </p>
    </>
  );
}
