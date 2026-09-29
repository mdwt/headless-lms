"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { EventChecklist } from "@/components/forms/event-checklist";
import { Input } from "@/components/ui/input";
import type { AutomationTriggerInfo } from "@/lib/api/types";

import { createWebhookAction } from "../actions";
import { webhookSchema, type WebhookFormValues } from "./webhook-schema";

const FORM_ID = "webhook-form";

const DEFAULTS: WebhookFormValues = { url: "", description: "", events: [] };

export function WebhookFormDialog({
  open,
  onOpenChange,
  triggers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggers: AutomationTriggerInfo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WebhookFormValues>({ resolver: zodResolver(webhookSchema), defaultValues: DEFAULTS });

  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const webhook = await createWebhookAction({
          url: values.url,
          events: values.events,
          description: values.description || undefined,
        });
        toast.success("Webhook created");
        onOpenChange(false);
        router.push(`/automations/webhooks/${webhook.id}`);
      } catch (err) {
        toast.error("Couldn't create webhook", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add webhook"
      description="Every selected event is sent to this URL as a signed POST request."
      formId={FORM_ID}
      submitLabel="Add webhook"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="url" label="Endpoint URL" required error={errors.url?.message}>
          <Input
            id="url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/webhooks/lms"
            aria-invalid={Boolean(errors.url)}
            {...register("url")}
          />
        </Field>

        <Field
          id="description"
          label="Description"
          hint="Optional. What this endpoint is for."
          error={errors.description?.message}
        >
          <Input
            id="description"
            placeholder="e.g. CRM sync"
            aria-invalid={Boolean(errors.description)}
            {...register("description")}
          />
        </Field>

        <Controller
          control={control}
          name="events"
          render={({ field }) => (
            <Field id="events" label="Events" required error={errors.events?.message}>
              <EventChecklist
                id="events"
                value={field.value}
                onValueChange={field.onChange}
                events={triggers}
                aria-invalid={Boolean(errors.events)}
              />
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
