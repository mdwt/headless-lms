"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { SchemaFields, schemaDefaults } from "@/components/forms/schema-fields";

import { reconnectIntegrationAction } from "../actions";
import type { IntegrationRow } from "../integrations-view";

const FORM_ID = "reconnect-integration-form";

interface FormValues {
  secrets: Record<string, unknown>;
}

/** Reconnect flow: replace the connection's stored secrets (re-authenticate). */
export function ReconnectSheet({
  row,
  open,
  onOpenChange,
}: {
  row: IntegrationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { secrets: {} },
  });

  const integration = row?.integration;
  const connection = row?.connection;
  const name = integration ? integration.id.charAt(0).toUpperCase() + integration.id.slice(1) : "";

  // Always starts blank — stored secrets are never echoed back.
  React.useEffect(() => {
    if (open && integration) {
      reset({ secrets: schemaDefaults(integration.secretsSchema) });
    }
  }, [open, integration, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!connection) return;
    startTransition(async () => {
      try {
        await reconnectIntegrationAction(connection.id, values.secrets);
        toast.success(`${name} reconnected`);
        onOpenChange(false);
      } catch (err) {
        toast.error(`Couldn't reconnect ${name}`, { description: (err as Error).message });
      }
    });
  });

  if (!integration || !connection) return null;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Reconnect ${name}`}
      description="Enter new credentials; they replace the stored ones immediately."
      formId={FORM_ID}
      submitLabel="Reconnect"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <SchemaFields schema={integration.secretsSchema} control={control} namePrefix="secrets" secret />
      </form>
    </FormSheet>
  );
}
