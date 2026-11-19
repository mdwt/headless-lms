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

import { createAppAction, updateAppAction } from "./actions";

const FORM_ID = "app-form";

function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const web = url.protocol === "https:" || url.protocol === "http:";
  return web && url.pathname === "/" && url.search === "" && url.hash === "";
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
      .refine(isOrigin, "Use an origin such as https://learn.example.com, without a path"),
    courses: z.boolean(),
    community: z.boolean(),
  })
  .refine((values) => values.courses || values.community, {
    path: ["courses"],
    message: "An app serves courses, the community, or both",
  });

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { name: "", slug: "", domain: "", courses: false, community: false };

export function AppDialog({
  open,
  onOpenChange,
  app,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The app being edited; absent when adding one. */
  app?: OrgApp;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
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

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        if (app) {
          await updateAppAction(app.id, values);
        } else {
          await createAppAction(values);
        }
        toast.success(app ? "App updated" : "App added", { description: values.domain });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(app ? "Couldn't update the app" : "Couldn't add the app", {
          description: (err as Error).message,
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={app ? "Edit app" : "Add app"}
      description="An app is a frontend your organization runs on a domain. Members sign in there, and links in emails and invites open it."
      formId={FORM_ID}
      submitLabel={app ? "Save" : "Add app"}
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="app-name" label="Name" required error={errors.name?.message}>
            <Input id="app-name" aria-invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field id="app-slug" label="Slug" required error={errors.slug?.message}>
            <Input id="app-slug" aria-invalid={!!errors.slug} {...register("slug")} />
          </Field>
        </div>

        <Field
          id="app-domain"
          label="Domain"
          required
          error={errors.domain?.message}
          hint="The address the app is reached at. No other app can use it."
        >
          <Input
            id="app-domain"
            placeholder="https://learn.example.com"
            aria-invalid={!!errors.domain}
            {...register("domain")}
          />
        </Field>

        <Field id="app-courses" label="Serves" error={errors.courses?.message}>
          <div className="flex flex-col gap-2.5">
            <label htmlFor="app-courses" className="flex items-center gap-2.5 text-sm text-ink-2">
              <Checkbox id="app-courses" {...register("courses")} />
              Courses and downloads
            </label>
            <label htmlFor="app-community" className="flex items-center gap-2.5 text-sm text-ink-2">
              <Checkbox id="app-community" {...register("community")} />
              Communities and events
            </label>
          </div>
        </Field>
      </form>
    </FormDialog>
  );
}
