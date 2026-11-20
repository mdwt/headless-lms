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
import { cn } from "@/lib/utils";

import { createAppAction, updateAppAction } from "../actions";
import { COMMUNITY_LABEL, COURSES_LABEL } from "../apps-columns";

const FORM_ID = "app-form";

const HOST_NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const HOST_IPV6 = /^\[[0-9a-f:.]+\]$/;

function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const web = url.protocol === "https:" || url.protocol === "http:";
  const bare = url.pathname === "/" && url.search === "" && url.hash === "";
  const plain = url.username === "" && url.password === "";
  const named = HOST_NAME.test(url.hostname) || HOST_IPV6.test(url.hostname);
  return web && bare && plain && named;
}

function withScheme(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function shown(domain: string): string {
  return domain.startsWith("https://") ? domain.slice("https://".length) : domain;
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Keep it under 100 characters"),
    slug: z
      .string()
      .min(1, "A slug is required")
      .max(50, "Keep it under 50 characters")
      .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
    domain: z
      .string()
      .trim()
      .transform(withScheme)
      .refine(isOrigin, "Enter a domain like learn.example.com, with nothing after it"),
    courses: z.boolean(),
    community: z.boolean(),
  })
  .refine((values) => values.courses || values.community, {
    path: ["courses"],
    message: "Choose at least one",
  });

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;

const SLUG_TAKEN = "Another app has this slug";

const REFUSED: Record<string, { field: FieldName; message: string }> = {
  domain_taken: { field: "domain", message: "Another app already uses this domain" },
  domain_reserved: {
    field: "domain",
    message: "This address is one of the system's own. Choose another.",
  },
  slug_taken: { field: "slug", message: SLUG_TAKEN },
  courses_taken: { field: "courses", message: "Another app already has courses and downloads" },
  community_taken: {
    field: "community",
    message: "Another app already has communities and events",
  },
};

function takenNote(other: OrgApp): string {
  return other.courses && other.community
    ? `On ${other.name}. Untick it there to move it.`
    : `On ${other.name}.`;
}

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

  const others = apps.filter((other) => other.id !== app?.id);
  const coursesApp = others.find((other) => other.courses);
  const communityApp = others.find((other) => other.community);
  const coursesFree = !coursesApp;
  const communityFree = !communityApp;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", domain: "", courses: false, community: false },
  });

  useEffect(() => {
    if (open) {
      reset(
        app
          ? {
              name: app.name,
              slug: app.slug,
              domain: shown(app.domain),
              courses: app.courses,
              community: app.community,
            }
          : { name: "", slug: "", domain: "", courses: coursesFree, community: communityFree },
      );
    }
  }, [open, app, reset, coursesFree, communityFree]);

  const onSubmit = handleSubmit((values) => {
    if (others.some((other) => other.slug === values.slug)) {
      setError("slug", { message: SLUG_TAKEN }, { shouldFocus: true });
      return;
    }
    startTransition(async () => {
      try {
        const refusal = app ? await updateAppAction(app.id, values) : await createAppAction(values);
        if (refusal) {
          const known = refusal.code ? REFUSED[refusal.code] : undefined;
          if (known) {
            setError(known.field, { message: known.message }, { shouldFocus: true });
          } else {
            toast.error(app ? "Couldn't save" : "Couldn't create app", {
              description: refusal.refused,
            });
          }
          router.refresh();
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
          ? "If you change the domain, members sign in at the new one straight away. Links already sent to the old one stop working."
          : "Members sign in on the app's domain, and links in emails and invites open there."
      }
      formId={FORM_ID}
      submitLabel={app ? "Save" : "Create app"}
      pending={pending}
      submitDisabled={!!app && !isDirty}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="app-name" label="Name" required error={errors.name?.message}>
          <Input id="app-name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>

        <Field
          id="app-slug"
          label="Slug"
          required
          error={errors.slug?.message}
          hint="A short name for this app, like academy. Lowercase letters, numbers and hyphens."
        >
          <Input id="app-slug" aria-invalid={!!errors.slug} {...register("slug")} />
        </Field>

        <Field
          id="app-domain"
          label="Domain"
          required
          error={errors.domain?.message}
          hint="The address members open, like learn.example.com. A domain belongs to one app."
        >
          <Input
            id="app-domain"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="learn.example.com"
            aria-invalid={!!errors.domain}
            {...register("domain")}
          />
        </Field>

        <Field
          id="app-content"
          label="Content"
          required
          error={errors.courses?.message ?? errors.community?.message}
          hint="What members find in this app."
        >
          <div id="app-content" role="group" aria-label="Content" className="flex flex-col gap-2.5">
            <label
              htmlFor="app-courses"
              className={cn(
                "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm",
                coursesFree ? "text-ink-2" : "text-ink-4",
              )}
            >
              <Checkbox id="app-courses" disabled={!coursesFree} {...register("courses")} />
              {COURSES_LABEL}
              {coursesApp ? <span>{takenNote(coursesApp)}</span> : null}
            </label>
            <label
              htmlFor="app-community"
              className={cn(
                "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm",
                communityFree ? "text-ink-2" : "text-ink-4",
              )}
            >
              <Checkbox id="app-community" disabled={!communityFree} {...register("community")} />
              {COMMUNITY_LABEL}
              {communityApp ? <span>{takenNote(communityApp)}</span> : null}
            </label>
          </div>
        </Field>
      </form>
    </FormDialog>
  );
}
