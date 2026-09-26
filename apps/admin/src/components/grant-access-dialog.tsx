"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
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

import { grantEntitlementAction } from "@/app/(dashboard)/entitlements/actions";

const FORM_ID = "grant-access-form";

export type LiteStudent = { id: string; name: string; email: string };

const schema = z
  .object({
    studentId: z.string().min(1, "Select a student"),
    expiryMode: z.enum(["never", "date"]),
    expiresAt: z.string().optional(),
  })
  .refine((d) => d.expiryMode === "never" || (!!d.expiresAt && d.expiresAt.length > 0), {
    message: "Pick an expiry date",
    path: ["expiresAt"],
  });

type FormValues = z.infer<typeof schema>;

/** Grant one student access to a piece of content — the content side is fixed
 *  by the page, so only the student and the expiry are picked here. */
export function GrantAccessDialog({
  open,
  onOpenChange,
  contentId,
  contentNoun,
  students,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string;
  contentNoun: string;
  students: LiteStudent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { studentId: "", expiryMode: "never", expiresAt: "" },
  });

  useEffect(() => {
    if (open) reset({ studentId: "", expiryMode: "never", expiresAt: "" });
  }, [open, reset]);

  const expiryMode = useWatch({ control, name: "expiryMode" });

  const studentOptions = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.name, description: s.email })),
    [students],
  );

  const onSubmit = handleSubmit((values) => {
    const input = {
      orgUserId: values.studentId,
      contentId,
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
        // This tab isn't one of the paths the action revalidates.
        router.refresh();
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
      description={`Grant a student access to this ${contentNoun}. They'll get immediate access.`}
      formId={FORM_ID}
      submitLabel="Grant access"
      pending={pending}
      submitDisabled={students.length === 0}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="studentId"
          render={({ field }) => (
            <Field
              id="studentId"
              label="Student"
              required
              error={errors.studentId?.message}
              hint={students.length === 0 ? "Every student already has access." : undefined}
            >
              <Combobox
                id="studentId"
                value={field.value}
                onValueChange={field.onChange}
                options={studentOptions}
                placeholder="Select a student"
                searchPlaceholder="Search by name or email…"
                emptyText="No students match"
                disabled={students.length === 0}
                aria-invalid={!!errors.studentId}
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
