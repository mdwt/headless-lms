"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Switch } from "@/components/ui/switch";
import { SchemaFields, schemaDefaults } from "@/components/forms/schema-fields";

import { configureConnectionAction } from "../actions";
import type { IntegrationRow } from "../integrations-view";

const FORM_ID = "configure-connection-form";

interface FormValues {
  config: Record<string, unknown>;
  active: boolean;
}

/** Configure flow: the connection's config fields (schema-rendered) + active flag. */
export function ConfigureSheet({
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
    defaultValues: { config: {}, active: true },
  });

  const integration = row?.integration;
  const connection = row?.connection;
  const name = integration ? integration.id.charAt(0).toUpperCase() + integration.id.slice(1) : "";

  // Seed from the connection's current config/active whenever the sheet opens.
  React.useEffect(() => {
    if (open && integration && connection) {
      reset({
        config: schemaDefaults(integration.configSchema, connection.config),
        active: connection.active,
      });
    }
  }, [open, integration, connection, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!connection) return;
    startTransition(async () => {
      try {
        await configureConnectionAction(connection.id, {
          config: values.config,
          active: values.active,
        });
        toast.success(`${name} updated`);
        onOpenChange(false);
      } catch (err) {
        toast.error(`Couldn't update ${name}`, { description: (err as Error).message });
      }
    });
  });

  if (!integration || !connection) return null;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Configure ${name}`}
      formId={FORM_ID}
      submitLabel="Save"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <SchemaFields schema={integration.configSchema} control={control} namePrefix="config" />
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Field
              id="active"
              label="Active"
              hint="Inactive connections keep their credentials but are skipped by callers."
            >
              <Switch id="active" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />
      </form>
    </FormSheet>
  );
}
