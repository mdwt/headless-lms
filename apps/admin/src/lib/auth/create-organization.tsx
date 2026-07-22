"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { signOut } from "@/lib/auth/client";
import { createOrganizationAction } from "@/lib/auth/actions";
import { uniqueOrgSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { Logo } from "@/components/app-shell/logo";

const schema = z.object({
  name: z.string().min(2, "Give your organization a name"),
});
type Values = z.infer<typeof schema>;

/**
 * Client island rendered by the `(dashboard)` server layout when the resolved
 * session has status `no-organization` (signed in, not a member of any org).
 * Creates the org — which the API also makes the session's active org — then
 * hard-reloads so the server session resolver picks up the new active org.
 */
export function CreateOrganization() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });

  async function onSubmit(values: Values) {
    const slug = uniqueOrgSlug(values.name);
    try {
      // Creates the org and makes it the session's active org, server-side.
      await createOrganizationAction({ name: values.name, slug });
    } catch (e) {
      toast.error("Couldn't create organization", {
        description: e instanceof Error ? e.message : undefined,
      });
      return;
    }
    // The new org + active-org selection live on the session server-side; a full
    // reload lets the server session resolver re-run and render the dashboard.
    window.location.assign("/");
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              Create your organization
            </h1>
            <p className="text-sm text-ink-3 text-pretty">
              You&apos;re signed in but not part of an organization yet. Create one to get started —
              you&apos;ll be its owner.
            </p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
            <Field id="org-name" label="Organization name" error={errors.name?.message} required>
              <Input id="org-name" placeholder="Your organization" {...register("name")} />
            </Field>
            <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Create organization
            </Button>
          </form>
        </div>
        <button
          type="button"
          onClick={() => signOut().then(() => router.replace("/login"))}
          className="mx-auto mt-4 block text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
