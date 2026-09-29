"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { EventChecklist } from "@/components/forms/event-checklist";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AutomationTriggerInfo, Webhook } from "@/lib/api/types";

import { updateWebhookAction } from "../../../actions";
import { webhookSchema, type WebhookFormValues } from "../../../_components/webhook-schema";

function valuesOf(webhook: Webhook): WebhookFormValues {
  return {
    url: webhook.url,
    description: webhook.description ?? "",
    events: webhook.events,
  };
}

export function WebhookSettingsForm({
  webhook,
  triggers,
}: {
  webhook: Webhook;
  triggers: AutomationTriggerInfo[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookSchema),
    defaultValues: valuesOf(webhook),
  });

  useEffect(() => {
    reset(valuesOf(webhook));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.id, webhook.updatedAt]);

  function onValid(values: WebhookFormValues) {
    startTransition(async () => {
      try {
        await updateWebhookAction(webhook.id, values);
        toast.success("Changes saved");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)}>
      <SettingsSection
        title="Endpoint"
        description="Where events are sent, and which ones."
        footer={
          <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        }
      >
        <Field id="url" label="Endpoint URL" required error={errors.url?.message}>
          <Input
            id="url"
            type="url"
            inputMode="url"
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
      </SettingsSection>
    </form>
  );
}
