"use client";

import { Field } from "@/components/forms/field";
import { SettingRow } from "@/components/forms/settings-section";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { LocationValues } from "../_lib/event-form";

type FieldErrors = Partial<Record<keyof LocationValues, { message?: string }>>;

export function LocationFields({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string;
  value: LocationValues;
  onChange: (value: LocationValues) => void;
  errors?: FieldErrors;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;

  function text(name: Exclude<keyof LocationValues, "inPerson" | "online">, label: string) {
    return (
      <Field id={id(name)} label={label} error={errors?.[name]?.message}>
        <Input
          id={id(name)}
          value={value[name]}
          onChange={(e) => onChange({ ...value, [name]: e.target.value })}
          aria-invalid={Boolean(errors?.[name])}
        />
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingRow id={id("in-person")} label="In person" hint="A venue with its address.">
        <Switch
          id={id("in-person")}
          checked={value.inPerson}
          onCheckedChange={(inPerson) => onChange({ ...value, inPerson })}
        />
      </SettingRow>
      {value.inPerson ? (
        <div className="flex flex-col gap-5">
          <Field id={id("venueName")} label="Venue" required error={errors?.venueName?.message}>
            <Input
              id={id("venueName")}
              placeholder="e.g. The Langham, Room 2"
              value={value.venueName}
              onChange={(e) => onChange({ ...value, venueName: e.target.value })}
              aria-invalid={Boolean(errors?.venueName)}
            />
          </Field>
          {text("line1", "Address line 1")}
          {text("line2", "Address line 2")}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {text("city", "City")}
            {text("region", "Region")}
            {text("postalCode", "Postal code")}
            <Field
              id={id("country")}
              label="Country"
              hint="A two-letter code, such as GB."
              error={errors?.country?.message}
            >
              <Input
                id={id("country")}
                maxLength={2}
                value={value.country}
                onChange={(e) => onChange({ ...value, country: e.target.value.toUpperCase() })}
                aria-invalid={Boolean(errors?.country)}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <SettingRow id={id("online")} label="Online" hint="A meeting link attendees open.">
        <Switch
          id={id("online")}
          checked={value.online}
          onCheckedChange={(online) => onChange({ ...value, online })}
        />
      </SettingRow>
      {value.online ? (
        <div className="flex flex-col gap-5">
          <Field id={id("url")} label="Meeting link" required error={errors?.url?.message}>
            <Input
              id={id("url")}
              type="url"
              placeholder="https://"
              value={value.url}
              onChange={(e) => onChange({ ...value, url: e.target.value })}
              aria-invalid={Boolean(errors?.url)}
            />
          </Field>
          <Field
            id={id("details")}
            label="Joining details"
            hint="Such as a passcode or a dial-in number."
            error={errors?.details?.message}
          >
            <Textarea
              id={id("details")}
              rows={2}
              value={value.details}
              onChange={(e) => onChange({ ...value, details: e.target.value })}
              aria-invalid={Boolean(errors?.details)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
