"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { SettingRow } from "@/components/forms/settings-section";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  NotificationCategory,
  NotificationReason,
  NotificationTypeInfo,
} from "@/lib/api/types";

import { channelLabel, reasonLabel } from "./labels";

const FORM_ID = "notification-category-form";

const KEY = /^[a-z][a-z0-9_]{0,63}$/;

const spaceValue = z.enum(["inherit", "on", "off"]);

const schema = z.object({
  key: z
    .string()
    .trim()
    .regex(KEY, "Lowercase letters, digits and underscores, starting with a letter"),
  covers: z
    .array(z.object({ type: z.string(), reasons: z.array(z.string()).min(1) }))
    .min(1, "Pick at least one notification"),
  channels: z
    .record(
      z.string(),
      z.object({ offered: z.boolean(), default: z.boolean(), locked: z.boolean() }),
    )
    .refine(
      (channels) => Object.values(channels).some((c) => c.offered),
      "Offer at least one channel",
    ),
  perSpace: z.boolean(),
  spaceDefaults: z.record(z.string(), z.record(z.string(), spaceValue)),
});

type FormValues = z.infer<typeof schema>;
type SpaceValue = z.infer<typeof spaceValue>;

export type CategorySpace = { id: string; name: string };

function valuesOf(
  category: NotificationCategory | null,
  channels: string[],
  spaces: CategorySpace[],
): FormValues {
  return {
    key: category?.key ?? "",
    covers: (category?.covers ?? []).map((c) => ({ type: c.type, reasons: [...c.reasons] })),
    channels: Object.fromEntries(
      channels.map((channel) => {
        const offered = category ? category.channels[channel] : undefined;
        return [
          channel,
          {
            offered: category ? offered !== undefined : channel === "inApp",
            default: offered?.default ?? true,
            locked: offered?.locked ?? false,
          },
        ];
      }),
    ),
    perSpace: category?.perSpace === true,
    spaceDefaults: Object.fromEntries(
      spaces.map((space) => [
        space.id,
        Object.fromEntries(
          channels.map((channel) => {
            const value = category?.spaceDefaults?.[space.id]?.[channel];
            return [channel, value === undefined ? "inherit" : value ? "on" : "off"];
          }),
        ),
      ]),
    ),
  };
}

function categoryOf(
  values: FormValues,
  original: NotificationCategory | null,
  spaces: CategorySpace[],
): NotificationCategory {
  const channels = Object.fromEntries(
    Object.entries(values.channels)
      .filter(([, c]) => c.offered)
      .map(([channel, c]) => [channel, { default: c.default, locked: c.locked }]),
  );
  const listed = new Set(spaces.map((s) => s.id));
  const spaceDefaults: Record<string, Record<string, boolean>> = {};
  if (values.perSpace) {
    for (const [spaceId, byChannel] of Object.entries(original?.spaceDefaults ?? {})) {
      if (!listed.has(spaceId)) spaceDefaults[spaceId] = byChannel;
    }
    for (const [spaceId, byChannel] of Object.entries(values.spaceDefaults)) {
      const set = Object.entries(byChannel).filter(
        ([channel, value]) => value !== "inherit" && channel in channels,
      );
      if (set.length > 0) {
        spaceDefaults[spaceId] = Object.fromEntries(set.map(([c, v]) => [c, v === "on"]));
      }
    }
  }
  return {
    key: values.key.trim(),
    covers: values.covers.map((c) => ({
      type: c.type,
      reasons: c.reasons as NotificationReason[],
    })),
    channels,
    ...(values.perSpace && { perSpace: true }),
    ...(Object.keys(spaceDefaults).length > 0 && { spaceDefaults }),
  };
}

function toggleReason(
  covers: FormValues["covers"],
  type: string,
  reason: string,
  on: boolean,
): FormValues["covers"] {
  const existing = covers.find((c) => c.type === type);
  if (!existing) return on ? [...covers, { type, reasons: [reason] }] : covers;
  return covers
    .map((c) =>
      c.type !== type
        ? c
        : {
            type,
            reasons: on
              ? [...c.reasons.filter((r) => r !== reason), reason]
              : c.reasons.filter((r) => r !== reason),
          },
    )
    .filter((c) => c.reasons.length > 0);
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  takenKeys,
  types,
  channels,
  spaces,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: NotificationCategory | null;
  takenKeys: string[];
  types: NotificationTypeInfo[];
  channels: string[];
  spaces: CategorySpace[] | null;
  onSave: (category: NotificationCategory) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(category, channels, spaces ?? []),
  });

  useEffect(() => {
    if (open) reset(valuesOf(category, channels, spaces ?? []));
  }, [open, category, channels, spaces, reset]);

  const covers = useWatch({ control, name: "covers" });
  const offered = useWatch({ control, name: "channels" });
  const perSpace = useWatch({ control, name: "perSpace" });
  const spaceDefaults = useWatch({ control, name: "spaceDefaults" });
  const offeredChannels = channels.filter((c) => offered[c]?.offered);

  const onSubmit = handleSubmit((values) => {
    if (takenKeys.includes(values.key.trim())) {
      setError("key", { message: "Another category uses this key" });
      return;
    }
    onSave(categoryOf(values, category, spaces ?? []));
    onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Edit category" : "Add category"}
      description="A category is one switch on a member's notification settings. It covers notifications for people with given reasons, on the channels it offers."
      formId={FORM_ID}
      submitLabel={category ? "Done" : "Add category"}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          id="category-key"
          label="Key"
          required
          error={errors.key?.message}
          hint="Apps label the category by its key. Members' settings follow the key."
        >
          <Input
            id="category-key"
            className="font-mono"
            aria-invalid={!!errors.key}
            {...register("key")}
          />
        </Field>

        <Field
          id="category-covers"
          label="Covers"
          required
          error={errors.covers?.message ?? errors.covers?.root?.message}
          hint="A notification files under the first category, in list order, that covers its type for one of the person's reasons."
        >
          <ul
            id="category-covers"
            role="list"
            className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-md border border-input"
          >
            {types.map((info) => {
              const cover = covers.find((c) => c.type === info.type);
              return (
                <li key={info.type} className="flex flex-col gap-1.5 px-3 py-2">
                  <span className="font-mono text-xs text-ink">{info.type}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {info.reasons.map((reason) => (
                      <label key={reason} className="flex items-center gap-2 text-sm text-ink-2">
                        <Checkbox
                          aria-label={`${info.type} for ${reasonLabel(reason)}`}
                          checked={cover?.reasons.includes(reason) ?? false}
                          onChange={(e) =>
                            setValue(
                              "covers",
                              toggleReason(covers, info.type, reason, e.target.checked),
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }
                        />
                        {reasonLabel(reason)}
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Field>

        <Field
          id="category-channels"
          label="Channels"
          required
          error={
            typeof errors.channels?.message === "string"
              ? errors.channels.message
              : errors.channels?.root?.message
          }
          hint="Members start from the default. A locked channel always uses its default."
        >
          <div id="category-channels" className="flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] gap-2 text-xs text-ink-4">
              <span>Channel</span>
              <span className="text-center">Offered</span>
              <span className="text-center">On</span>
              <span className="text-center">Locked</span>
            </div>
            {channels.map((channel) => {
              const value = offered[channel] ?? { offered: false, default: true, locked: false };
              return (
                <div
                  key={channel}
                  className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2"
                >
                  <span className="text-sm text-ink">{channelLabel(channel)}</span>
                  {(["offered", "default", "locked"] as const).map((field) => (
                    <span key={field} className="flex justify-center">
                      <Switch
                        aria-label={`${channelLabel(channel)} ${field === "default" ? "on by default" : field}`}
                        checked={value[field]}
                        disabled={field !== "offered" && !value.offered}
                        onCheckedChange={(checked) =>
                          setValue(
                            `channels.${channel}`,
                            { ...value, [field]: checked },
                            { shouldDirty: true, shouldValidate: true },
                          )
                        }
                      />
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </Field>

        {spaces !== null && (
          <SettingRow
            id="category-per-space"
            label="Set per space"
            hint="Members can switch it on or off for each space. Only notifications in a space can be per space."
          >
            <Switch
              id="category-per-space"
              checked={perSpace}
              onCheckedChange={(checked) => setValue("perSpace", checked, { shouldDirty: true })}
            />
          </SettingRow>
        )}

        {spaces !== null && perSpace && spaces.length > 0 && offeredChannels.length > 0 && (
          <Field
            id="category-space-defaults"
            label="Space defaults"
            hint="Overrides the channel default in one space, such as on in Announcements."
          >
            <div id="category-space-defaults" className="flex flex-col gap-2">
              {spaces.map((space) => (
                <div
                  key={space.id}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 truncate text-sm text-ink">{space.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {offeredChannels.map((channel) => (
                      <Select
                        key={channel}
                        value={spaceDefaults[space.id]?.[channel] ?? "inherit"}
                        onValueChange={(v) =>
                          setValue(`spaceDefaults.${space.id}.${channel}`, v as SpaceValue, {
                            shouldDirty: true,
                          })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-32"
                          aria-label={`${channelLabel(channel)} in ${space.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">{channelLabel(channel)}: default</SelectItem>
                          <SelectItem value="on">{channelLabel(channel)}: on</SelectItem>
                          <SelectItem value="off">{channelLabel(channel)}: off</SelectItem>
                        </SelectContent>
                      </Select>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>
        )}
      </form>
    </FormDialog>
  );
}
