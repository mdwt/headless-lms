"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiKeyRole } from "@/lib/api/types";

import { createApiKeyAction } from "./actions";

const FORM_ID = "create-api-key-form";

const NEVER = "never";
const EXPIRY_OPTIONS = [
  { value: NEVER, label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.string().min(1, "Select a role"),
  expiry: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: ApiKeyRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", role: "", expiry: NEVER },
  });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const { key } = await createApiKeyAction({
          name: values.name,
          role: values.role,
          ...(values.expiry !== NEVER && { expiresInDays: Number(values.expiry) }),
        });
        setCreatedKey(key);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't create the key", { description: (err as Error).message });
      }
    });
  });

  async function onCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success("API key copied");
    } catch (err) {
      toast.error("Couldn't copy the key", { description: (err as Error).message });
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setCreatedKey(null);
    onOpenChange(next);
  }

  if (createdKey) {
    return (
      <FormDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="API key created"
        formId={FORM_ID}
        submitLabel="Done"
      >
        <form
          id={FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            handleOpenChange(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <Input readOnly aria-label="API key" value={createdKey} className="font-mono text-sm" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onCopy}
              aria-label="Copy key"
            >
              <Copy />
            </Button>
          </div>
          <p className="text-sm text-ink-3">Copy this key now. It won&apos;t be shown again.</p>
        </form>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Create API key"
      formId={FORM_ID}
      submitLabel="Create key"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Field
              id="api-key-role"
              label="Role"
              required
              error={errors.role?.message}
              hint={
                roles.find((r) => r.key === field.value)?.description ||
                "The key holds this role's permissions, never more than you hold."
              }
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="api-key-role" aria-invalid={!!errors.role}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="expiry"
          render={({ field }) => (
            <Field id="api-key-expiry" label="Expires">
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
