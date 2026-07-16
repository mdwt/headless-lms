"use client";

import * as React from "react";
import { Controller, type Control, type FieldValues } from "react-hook-form";

import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Renders form fields from a flat JSON Schema object — the shape integrations
 * declare for their config and secrets. Supports the property kinds the
 * plugins emit: string (Input; password when `secret`), enum (Select),
 * boolean (Switch), number/integer (Input type=number). Values are registered
 * under `${namePrefix}.${key}` on the given react-hook-form control.
 */

interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  default?: unknown;
  description?: string;
}

interface JsonSchemaObject {
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** "botToken" → "Bot token", "statementDescriptor" → "Statement descriptor". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Default form values a schema implies (used to seed useForm defaults). */
export function schemaDefaults(
  schema: Record<string, unknown>,
  current?: Record<string, unknown>,
): Record<string, unknown> {
  const { properties = {} } = schema as JsonSchemaObject;
  return Object.fromEntries(
    Object.entries(properties).map(([key, prop]) => [
      key,
      current?.[key] ?? prop.default ?? (prop.type === "boolean" ? false : ""),
    ]),
  );
}

export function SchemaFields<T extends FieldValues>({
  schema,
  control,
  namePrefix,
  secret = false,
}: {
  schema: Record<string, unknown>;
  control: Control<T>;
  /** Form path the fields nest under, e.g. "secrets" or "config". */
  namePrefix: string;
  /** Render string fields as password inputs (never echo stored secrets). */
  secret?: boolean;
}) {
  const { properties = {}, required = [] } = schema as JsonSchemaObject;
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, prop]) => {
        const id = `${namePrefix}.${key}`;
        const label = humanize(key);
        const isRequired = required.includes(key);
        return (
          <Controller
            key={id}
            control={control}
            // Dynamic path — react-hook-form types can't know schema keys.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name={id as any}
            rules={isRequired ? { required: `${label} is required` } : undefined}
            render={({ field, fieldState }) => (
              <Field
                id={id}
                label={label}
                required={isRequired}
                error={fieldState.error?.message}
                hint={prop.description}
              >
                {prop.enum ? (
                  <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
                    <SelectTrigger id={id} aria-invalid={!!fieldState.error}>
                      <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {prop.enum.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : prop.type === "boolean" ? (
                  <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />
                ) : prop.type === "number" || prop.type === "integer" ? (
                  <Input
                    id={id}
                    type="number"
                    aria-invalid={!!fieldState.error}
                    value={(field.value as number | string | undefined) ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                ) : (
                  <Input
                    id={id}
                    type={secret ? "password" : "text"}
                    autoComplete={secret ? "off" : undefined}
                    aria-invalid={!!fieldState.error}
                    value={(field.value as string | undefined) ?? ""}
                    onChange={field.onChange}
                  />
                )}
              </Field>
            )}
          />
        );
      })}
    </>
  );
}
