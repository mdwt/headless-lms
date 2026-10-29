"use client";

import { useEffect, useMemo, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ContentType } from "@/lib/api/types";

import { grantEntitlementAction } from "../actions";

const FORM_ID = "grant-access-form";

/** Static lookup option sources fetched by the Server Component and passed in. */
export type LiteStudent = { id: string; name: string; email: string };
export type LiteContent = {
  id: string;
  title: string;
  type: ContentType | "bundle";
  /** For bundles: titles of the content items it contains. */
  itemTitles?: string[];
};

const GROUP_LABEL: Record<LiteContent["type"], string> = {
  course: "Courses",
  download: "Downloads",
  community: "Communities",
  bundle: "Bundles",
};

const schema = z
  .object({
    studentId: z.string().min(1, "Select a student"),
    contentId: z.string().min(1, "Select a course, download, community or bundle"),
    expiryMode: z.enum(["never", "date"]),
    expiresAt: z.string().optional(),
  })
  .refine((d) => d.expiryMode === "never" || (!!d.expiresAt && d.expiresAt.length > 0), {
    message: "Pick an expiry date",
    path: ["expiresAt"],
  });

type FormValues = z.infer<typeof schema>;

export function GrantAccessDialog({
  open,
  onOpenChange,
  students,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: LiteStudent[];
  content: LiteContent[];
}) {
  const [pending, startTransition] = useTransition();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { studentId: "", contentId: "", expiryMode: "never", expiresAt: "" },
  });

  // Reset to a clean slate every time the sheet opens.
  useEffect(() => {
    if (open) reset({ studentId: "", contentId: "", expiryMode: "never", expiresAt: "" });
  }, [open, reset]);

  const expiryMode = useWatch({ control, name: "expiryMode" });

  const studentOptions = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.name, description: s.email })),
    [students],
  );
  const contentOptions = useMemo(
    () =>
      content.map((c) => ({
        value: c.id,
        label: c.title,
        description: c.itemTitles?.length ? c.itemTitles.join(", ") : undefined,
        group: GROUP_LABEL[c.type],
      })),
    [content],
  );

  const onSubmit = handleSubmit((values) => {
    const isBundle = content.find((c) => c.id === values.contentId)?.type === "bundle";
    const input = {
      orgUserId: values.studentId,
      contentId: isBundle ? null : values.contentId,
      bundleId: isBundle ? values.contentId : null,
      expiresAt:
        values.expiryMode === "never" || !values.expiresAt
          ? null
          : new Date(values.expiresAt).toISOString(),
    };
    startTransition(async () => {
      try {
        await grantEntitlementAction(input);
        toast.success("Access granted");
        onOpenChange(false);
      } catch (err) {
        toast.error("Couldn't grant access", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Grant access"
      description="Grant a student access to a course, download, community or bundle manually. They'll get immediate access."
      formId={FORM_ID}
      submitLabel="Grant access"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="studentId"
          render={({ field }) => (
            <Field id="studentId" label="Student" required error={errors.studentId?.message}>
              <Combobox
                id="studentId"
                value={field.value}
                onValueChange={field.onChange}
                options={studentOptions}
                placeholder="Select a student"
                searchPlaceholder="Search by name or email…"
                emptyText="No students match"
                aria-invalid={!!errors.studentId}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="contentId"
          render={({ field }) => (
            <Field id="contentId" label="Content" required error={errors.contentId?.message}>
              <Combobox
                id="contentId"
                value={field.value}
                onValueChange={field.onChange}
                options={contentOptions}
                placeholder="Select a course, download, community or bundle"
                searchPlaceholder="Search courses, downloads, communities and bundles…"
                emptyText="No content matches"
                aria-invalid={!!errors.contentId}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="expiryMode"
          render={({ field }) => (
            <Field
              id="expiryMode"
              label="Access expiry"
              hint="Lifetime access never expires; set a date to time-box this entitlement."
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="expiryMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="date">Expires on a date</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        {expiryMode === "date" ? (
          <Field id="expiresAt" label="Expiry date" required error={errors.expiresAt?.message}>
            <Input
              id="expiresAt"
              type="date"
              aria-invalid={!!errors.expiresAt}
              {...register("expiresAt")}
            />
          </Field>
        ) : null}
      </form>
    </FormDialog>
  );
}
