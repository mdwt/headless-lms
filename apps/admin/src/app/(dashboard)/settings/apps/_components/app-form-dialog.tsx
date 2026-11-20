"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { OrgApp } from "@/lib/api/types";

import { createAppAction, updateAppAction } from "../actions";
import { COMMUNITY_LABEL, COURSES_LABEL } from "../apps-columns";

const FORM_ID = "app-form";

function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const web = url.protocol === "https:" || url.protocol === "http:";
  const bare = url.pathname === "/" && url.search === "" && url.hash === "";
  const plain = url.username === "" && url.password === "" && !url.hostname.endsWith(".");
  return web && bare && plain;
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    slug: z
      .string()
      .min(1, "A slug is required")
      .max(50)
      .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
    domain: z
      .string()
      .trim()
      .refine(isOrigin, "Enter the full address, starting with https:// and ending at the domain"),
    courses: z.boolean(),
    community: z.boolean(),
  })
  .refine((values) => values.courses || values.community, {
    path: ["courses"],
    message: "Select at least one",
  });

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { name: "", slug: "", domain: "", courses: false, community: false };

export function AppFormDialog({
  open,
  onOpenChange,
  app,
  apps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app?: OrgApp;
  apps: OrgApp[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  useEffect(() => {
    if (open) {
      reset(
        app
          ? {
              name: app.name,
              slug: app.slug,
              domain: app.domain,
              courses: app.courses,
              community: app.community,
            }
          : DEFAULTS,
      );
    }
  }, [open, app, reset]);

  const others = apps.filter((other) => other.id !== app?.id);
  const coursesApp = others.find((other) => other.courses);
  const communityApp = others.find((other) => other.community);

  const onSubmit = handleSubmit((values) => {
    if (others.some((other) => other.slug === values.slug)) {
      setError("slug", { message: "Another app has this slug" });
      return;
    }
    startTransition(async () => {
      try {
        const refusal = app ? await updateAppAction(app.id, values) : await createAppAction(values);
        if (refusal) {
          setError("domain", { message: refusal.refused });
          return;
        }
        toast.success(app ? "Changes saved" : "App created", { description: values.name });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(app ? "Couldn't save" : "Couldn't create app", {
          description: (err as Error).message,
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={app ? "Edit app" : "Create app"}
      description={
        app
          ? "A new domain takes over sign-in and links straight away."
          : "Members sign in on the app's domain, and links in emails and invites open there."
      }
      formId={FORM_ID}
      submitLabel={app ? "Save" : "Create app"}
      pending={pending}
      submitDisabled={!!app && !isDirty}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="app-name" label="Name" required error={errors.name?.message}>
            <Input id="app-name" aria-invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            id="app-slug"
            label="Slug"
            required
            error={errors.slug?.message}
            hint="A short identifier, unique in your organization."
          >
            <Input id="app-slug" aria-invalid={!!errors.slug} {...register("slug")} />
          </Field>
        </div>

        <Field
          id="app-domain"
          label="Domain"
          required
          error={errors.domain?.message}
          hint="The address members open. A domain belongs to one app."
        >
          <Input
            id="app-domain"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://learn.example.com"
            aria-invalid={!!errors.domain}
            {...register("domain")}
          />
        </Field>

        <Field id="app-content" label="Content" required error={errors.courses?.message}>
          <div id="app-content" role="group" aria-label="Content" className="flex flex-col gap-2.5">
            <label htmlFor="app-courses" className="flex items-center gap-2.5 text-sm text-ink-2">
              <Checkbox id="app-courses" disabled={!!coursesApp} {...register("courses")} />
              {COURSES_LABEL}
              {coursesApp ? <span className="text-ink-4">Already on {coursesApp.name}</span> : null}
            </label>
            <label htmlFor="app-community" className="flex items-center gap-2.5 text-sm text-ink-2">
              <Checkbox id="app-community" disabled={!!communityApp} {...register("community")} />
              {COMMUNITY_LABEL}
              {communityApp ? (
                <span className="text-ink-4">Already on {communityApp.name}</span>
              ) : null}
            </label>
          </div>
        </Field>
      </form>
    </FormDialog>
  );
}
