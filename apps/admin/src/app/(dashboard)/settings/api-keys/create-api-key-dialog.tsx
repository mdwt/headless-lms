"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { ScopePicker } from "@/components/forms/scope-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessScope } from "@/lib/api/types";
import { defaultSelected } from "@/lib/auth/oauth-flow";

import { createApiKeyAction } from "./actions";

const FORM_ID = "create-api-key-form";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  scopes: z.array(z.string()).min(1, "Choose at least one permission"),
});

type FormValues = z.infer<typeof schema>;

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  scopes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopes: AccessScope[];
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
    defaultValues: { name: "", scopes: scopes.filter(defaultSelected) },
  });
  const chosen = useWatch({ control, name: "scopes" });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const { key } = await createApiKeyAction({
          name: values.name,
          scopes: scopes.filter((scope) => values.scopes.includes(scope)),
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
      submitDisabled={chosen.length === 0}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Controller
          control={control}
          name="scopes"
          render={({ field }) => (
            <Field id="scopes" label="Permissions" required error={errors.scopes?.message}>
              <ScopePicker scopes={scopes} value={field.value} onChange={field.onChange} />
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
