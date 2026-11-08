"use client";

import { useMemo } from "react";

import { Field } from "@/components/forms/field";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

import type { WhenValues } from "../_lib/event-form";
import { addMinutes } from "../_lib/event-time";

type FieldErrors = Partial<Record<keyof WhenValues, { message?: string }>>;

export function WhenFields({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string;
  value: WhenValues;
  onChange: (value: WhenValues) => void;
  errors?: FieldErrors;
}) {
  const timeZones = useMemo(
    () =>
      [...new Set([...Intl.supportedValuesOf("timeZone"), "UTC", value.timeZone])]
        .filter(Boolean)
        .map((zone) => ({
          value: zone,
          label: zone.replace(/_/g, " "),
          group: zone.includes("/") ? zone.split("/")[0] : "Other",
        })),
    [value.timeZone],
  );

  function setStart(start: string) {
    const end = value.end && value.end > start ? value.end : addMinutes(start, 60);
    onChange({ ...value, start, end });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id={`${idPrefix}-start`} label="Starts" required error={errors?.start?.message}>
          <Input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={value.start}
            onChange={(e) => setStart(e.target.value)}
            aria-invalid={Boolean(errors?.start)}
          />
        </Field>
        <Field id={`${idPrefix}-end`} label="Ends" required error={errors?.end?.message}>
          <Input
            id={`${idPrefix}-end`}
            type="datetime-local"
            value={value.end}
            min={value.start || undefined}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            aria-invalid={Boolean(errors?.end)}
          />
        </Field>
      </div>
      <Field
        id={`${idPrefix}-time-zone`}
        label="Time zone"
        required
        hint="The start and end are in this time zone."
        error={errors?.timeZone?.message}
      >
        <Combobox
          id={`${idPrefix}-time-zone`}
          value={value.timeZone}
          onValueChange={(timeZone) => onChange({ ...value, timeZone })}
          options={timeZones}
          placeholder="Pick a time zone"
          searchPlaceholder="Search time zones…"
          aria-invalid={Boolean(errors?.timeZone)}
        />
      </Field>
    </div>
  );
}
