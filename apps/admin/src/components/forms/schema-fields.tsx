"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, type Control, type FieldValues } from "react-hook-form";

import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
 * boolean (Switch), number/integer (Input type=number), object (JSON
 * Textarea), and `x-options`-annotated strings (a Select whose options come
 * from an integration action, via `remote`). Values are registered under
 * `${namePrefix}.${key}` on the given react-hook-form control.
 */

interface RemoteOptionsMeta {
  action: string;
  items: string;
  value: string;
  label: string;
}

interface JsonSchemaProperty {
  type?: string;
  enum?: string[];
  default?: unknown;
  description?: string;
  "x-options"?: RemoteOptionsMeta;
}

/** How `x-options` fields resolve their choices: invoke the declaring
 *  integration's listing action, or explain why that's not possible. */
export interface RemoteOptionsSource {
  /** Invoke the named action on the integration's connection. */
  load?: (action: string) => Promise<Record<string, unknown>>;
  /** Shown instead of the select when there is no active connection (or the load fails). */
  unavailable?: ReactNode;
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
  remote,
}: {
  schema: Record<string, unknown>;
  control: Control<T>;
  /** Form path the fields nest under, e.g. "secrets" or "config". */
  namePrefix: string;
  /** Render string fields as password inputs (never echo stored secrets). */
  secret?: boolean;
  /** Where `x-options` fields get their choices (integration action invocation). */
  remote?: RemoteOptionsSource;
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
                {prop["x-options"] ? (
                  <RemoteOptionsSelect
                    id={id}
                    invalid={!!fieldState.error}
                    value={typeof field.value === "string" ? field.value : ""}
                    onChange={field.onChange}
                    meta={prop["x-options"]}
                    remote={remote}
                  />
                ) : prop.enum ? (
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
                ) : prop.type === "object" ? (
                  <JsonTextarea
                    id={id}
                    invalid={!!fieldState.error}
                    value={field.value}
                    onChange={field.onChange}
                  />
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

interface RemoteOptionsResult {
  key: string;
  ok: boolean;
  options: { value: string; label: string }[];
}

function RemoteOptionsSelect({
  id,
  invalid,
  value,
  onChange,
  meta,
  remote,
}: {
  id: string;
  invalid: boolean;
  value: string;
  onChange: (value: string) => void;
  meta: RemoteOptionsMeta;
  remote?: RemoteOptionsSource;
}) {
  const load = remote?.load;
  const { action, items, value: valueKey, label: labelKey } = meta;
  const requestKey = `${action}|${items}|${valueKey}|${labelKey}`;
  const [result, setResult] = useState<RemoteOptionsResult | null>(null);

  useEffect(() => {
    if (!load) return;
    let alive = true;
    const key = `${action}|${items}|${valueKey}|${labelKey}`;
    load(action)
      .then((output) => {
        if (!alive) return;
        const rows = output[items];
        const options = Array.isArray(rows)
          ? rows
              .map((row) => ({
                value: String((row as Record<string, unknown>)[valueKey] ?? ""),
                label: String((row as Record<string, unknown>)[labelKey] ?? ""),
              }))
              .filter((o) => o.value)
          : [];
        setResult({ key, ok: true, options });
      })
      .catch(() => {
        if (alive) setResult({ key, ok: false, options: [] });
      });
    return () => {
      alive = false;
    };
  }, [load, action, items, valueKey, labelKey]);

  const current = result?.key === requestKey ? result : null;

  if (!load || current?.ok === false) {
    return (
      <div className="text-sm text-ink-3">
        {remote?.unavailable ?? "These options can't be loaded right now."}
      </div>
    );
  }

  const loading = current === null;
  // Keep a stored value selectable even when it no longer appears in the listing.
  const listed = current?.options ?? [];
  const options =
    value && !listed.some((o) => o.value === value) ? [{ value, label: value }, ...listed] : listed;

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} disabled={loading}>
        <SelectValue placeholder={loading ? "Loading…" : "Select an option"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Object-typed properties are authored as JSON; the parsed object only
 *  propagates while the text stays valid. */
function JsonTextarea({
  id,
  invalid,
  value,
  onChange,
}: {
  id: string;
  invalid: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => {
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    return typeof value === "string" ? value : "";
  });
  const [parseFailed, setParseFailed] = useState(false);

  return (
    <Textarea
      id={id}
      value={text}
      aria-invalid={invalid || (parseFailed && text.trim() !== "")}
      spellCheck={false}
      className="font-mono text-xs"
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        try {
          onChange(JSON.parse(next));
          setParseFailed(false);
        } catch {
          setParseFailed(true);
        }
      }}
    />
  );
}
