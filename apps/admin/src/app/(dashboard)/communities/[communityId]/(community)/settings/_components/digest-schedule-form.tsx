"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { DigestSchedule } from "@/lib/api/types";

import { patchDigestScheduleAction } from "../../../../actions";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const schema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(["daily", "weekly"]),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  timeZone: z.string().min(1, "Pick a time zone"),
});

type FormValues = z.infer<typeof schema>;

function valuesOf(digest: DigestSchedule | null): FormValues {
  return {
    enabled: digest !== null,
    cadence: digest?.cadence ?? "weekly",
    weekday: digest?.weekday ?? 1,
    hour: digest?.hour ?? 8,
    timeZone: digest?.timeZone ?? "UTC",
  };
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function DigestScheduleForm({
  communityId,
  digest,
}: {
  communityId: string;
  digest: DigestSchedule | null;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesOf(digest) });

  useEffect(() => {
    reset(valuesOf(digest));
  }, [digest, reset]);

  const values = useWatch({ control });
  const timeZones = useMemo(
    () =>
      [
        ...new Set([
          ...Intl.supportedValuesOf("timeZone"),
          "UTC",
          ...(digest ? [digest.timeZone] : []),
        ]),
      ].map((zone) => ({
        value: zone,
        label: zone.replace(/_/g, " "),
        group: zone.includes("/") ? zone.split("/")[0] : "Other",
      })),
    [digest],
  );

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValue(key, value as never, { shouldDirty: true, shouldValidate: true });
  }

  function onValid(next: FormValues) {
    startTransition(async () => {
      try {
        const saved = await patchDigestScheduleAction(
          communityId,
          next.enabled
            ? {
                cadence: next.cadence,
                weekday: next.weekday,
                hour: next.hour,
                timeZone: next.timeZone,
              }
            : null,
        );
        reset(valuesOf(saved));
        toast.success(saved ? "Digest schedule saved" : "Digest turned off");
      } catch (err) {
        toast.error("Couldn't save the digest schedule", { description: (err as Error).message });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)}>
      <SettingsSection
        title="Digest"
        description="An email summing up the posts since the last one, sent to members on this schedule. Members who switch the Digest category off don't get it."
        footer={
          <Button type="submit" variant="primary" disabled={isPending || !isDirty}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        }
      >
        <SettingRow
          id="digest-enabled"
          label="Send a digest"
          hint="Off sends no digest. The first one after a change goes out at the next scheduled time."
        >
          <Switch
            id="digest-enabled"
            checked={values.enabled ?? false}
            onCheckedChange={(checked) => {
              set("enabled", checked);
              if (checked && !digest) {
                set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
              }
            }}
          />
        </SettingRow>
        {values.enabled && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="digest-cadence" label="How often">
              <Select
                value={values.cadence}
                onValueChange={(v) => set("cadence", v as FormValues["cadence"])}
              >
                <SelectTrigger id="digest-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {values.cadence === "weekly" && (
              <Field id="digest-weekday" label="Day">
                <Select
                  value={String(values.weekday)}
                  onValueChange={(v) => set("weekday", Number(v))}
                >
                  <SelectTrigger id="digest-weekday">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field id="digest-hour" label="Time">
              <Select value={String(values.hour)} onValueChange={(v) => set("hour", Number(v))}>
                <SelectTrigger id="digest-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {hourLabel(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="digest-time-zone" label="Time zone" error={errors.timeZone?.message}>
              <Combobox
                id="digest-time-zone"
                value={values.timeZone ?? ""}
                onValueChange={(v) => set("timeZone", v)}
                options={timeZones}
                placeholder="Pick a time zone"
                searchPlaceholder="Search time zones…"
                aria-invalid={Boolean(errors.timeZone)}
              />
            </Field>
          </div>
        )}
      </SettingsSection>
    </form>
  );
}
