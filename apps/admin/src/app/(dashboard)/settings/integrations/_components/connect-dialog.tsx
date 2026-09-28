"use client";

import type { JsonValueInput } from "@headless-lms/sdk";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { SchemaFields, schemaDefaults } from "@/components/forms/schema-fields";

import { connectIntegrationAction } from "../actions";
import type { IntegrationRow } from "../integrations-view";

const FORM_ID = "connect-integration-form";

interface FormValues {
  secrets: Record<string, unknown>;
  config: Record<string, unknown>;
}

/** Connect flow: secrets + config fields rendered from the integration's schemas. */
export function ConnectDialog({
  row,
  open,
  onOpenChange,
}: {
  row: IntegrationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { secrets: {}, config: {} },
  });

  const integration = row?.integration;
  const name = integration ? integration.id.charAt(0).toUpperCase() + integration.id.slice(1) : "";

  // Seed schema-implied defaults whenever the sheet opens for an integration.
  useEffect(() => {
    if (open && integration) {
      reset({
        secrets: schemaDefaults(integration.secretsSchema),
        config: schemaDefaults(integration.configSchema),
      });
    }
  }, [open, integration, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!integration) return;
    startTransition(async () => {
      try {
        await connectIntegrationAction({
          integrationId: integration.id,
          secrets: values.secrets as Record<string, JsonValueInput>,
          config: values.config as Record<string, JsonValueInput> | undefined,
        });
        toast.success(`${name} connected`);
        onOpenChange(false);
      } catch (err) {
        toast.error(`Couldn't connect ${name}`, { description: (err as Error).message });
      }
    });
  });

  if (!integration) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Connect ${name}`}
      description="Credentials are encrypted at rest and never shown again after saving."
      formId={FORM_ID}
      submitLabel="Connect"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <SchemaFields
          schema={integration.secretsSchema}
          control={control}
          namePrefix="secrets"
          secret
        />
        <SchemaFields schema={integration.configSchema} control={control} namePrefix="config" />
      </form>
    </FormDialog>
  );
}
