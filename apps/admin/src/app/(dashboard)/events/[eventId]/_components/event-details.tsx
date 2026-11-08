"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Controller,
  useForm,
  useWatch,
  type DefaultValues,
  type FieldValues,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImageIcon, Loader2 } from "lucide-react";

import { Field } from "@/components/forms/field";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/http";
import type { EventItem } from "@/lib/api/types";

import { confirmAssetAction, requestUploadAction } from "../../../media/actions";
import { putToStorage } from "../../../media/upload-to-storage";
import { updateEventAction, type EventPatch } from "../../actions";
import {
  TYPE_LABEL,
  locationOf,
  locationSchema,
  locationValuesOf,
  recordingOf,
  recordingSchema,
  recordingValuesOf,
  timesOf,
  whenSchema,
  whenValuesOf,
} from "../../_lib/event-form";
import { LocationFields } from "../../_components/location-fields";
import { WhenFields } from "../../_components/when-fields";

function useSectionForm<T extends FieldValues>(schema: z.ZodType<T, T>, serverValues: T) {
  const form = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: serverValues as DefaultValues<T>,
  });
  const serverKey = JSON.stringify(serverValues);
  const { reset } = form;
  useEffect(() => {
    reset(JSON.parse(serverKey) as T);
  }, [serverKey, reset]);
  return form;
}

function useSave(eventId: string, success: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function save(patch: EventPatch) {
    startTransition(async () => {
      try {
        await updateEventAction(eventId, patch);
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }
  return { isPending, save };
}

function SectionForm({
  title,
  description,
  locked,
  isPending,
  isDirty,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  locked: boolean;
  isPending: boolean;
  isDirty: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        <SettingsSection
          title={title}
          description={description}
          footer={
            <Button type="submit" variant="primary" disabled={locked || isPending || !isDirty}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          }
        >
          {children}
        </SettingsSection>
      </fieldset>
    </form>
  );
}

const basicsSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120, "Keep it under 120 characters"),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters"),
});

function BasicsForm({ event, locked }: { event: EventItem; locked: boolean }) {
  const { isPending, save } = useSave(event.id, "Changes saved");
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useSectionForm(basicsSchema, { title: event.title, description: event.description });

  return (
    <SectionForm
      title="Basics"
      locked={locked}
      isPending={isPending}
      isDirty={isDirty}
      onSubmit={handleSubmit((values) => save(values))}
    >
      <Field id="title" label="Title" required error={errors.title?.message}>
        <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title")} />
      </Field>
      <Field
        id="description"
        label="Description"
        hint="Markdown. Shown on the event page."
        error={errors.description?.message}
      >
        <Textarea
          id="description"
          rows={6}
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
      </Field>
      <CoverField
        eventId={event.id}
        thumbnailAssetId={event.thumbnailAssetId}
        url={event.thumbnailUrl}
        locked={locked}
      />
    </SectionForm>
  );
}

function CoverField({
  eventId,
  thumbnailAssetId,
  url,
  locked,
}: {
  eventId: string;
  thumbnailAssetId: string | null;
  url: string | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = uploadedUrl ?? url;

  async function onFileSelected(file: File) {
    setUploading(true);
    try {
      const ticket = await requestUploadAction({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentId: eventId,
      });
      await putToStorage(ticket.uploadUrl, ticket.headers ?? {}, file);
      const asset = await confirmAssetAction(ticket.asset.id);
      await updateEventAction(eventId, { thumbnailAssetId: ticket.asset.id });
      setUploadedUrl(asset.url);
      toast.success("Cover updated");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't update cover", {
        description: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field id="cover" label="Cover" hint="Shown on the event card and page.">
      <div className="flex items-center gap-4">
        <div className="flex aspect-video w-32 items-center justify-center overflow-hidden rounded-lg bg-surface-2 outline-1 -outline-offset-1 outline-ink/5">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-ink-4" />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onFileSelected(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || locked}
        >
          {uploading && <Loader2 className="animate-spin" />}
          {thumbnailAssetId ? "Change cover" : "Upload cover"}
        </Button>
      </div>
    </Field>
  );
}

const whenFormSchema = z.object({ when: whenSchema });

function WhenForm({ event, locked }: { event: EventItem; locked: boolean }) {
  const { isPending, save } = useSave(event.id, "Times saved");
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useSectionForm(whenFormSchema, { when: whenValuesOf(event) });

  return (
    <SectionForm
      title="When"
      description="Moving a published event tells its attendees and moves their reminders."
      locked={locked}
      isPending={isPending}
      isDirty={isDirty}
      onSubmit={handleSubmit((values) => save(timesOf(values.when)))}
    >
      <Controller
        control={control}
        name="when"
        render={({ field }) => (
          <WhenFields
            idPrefix="when"
            value={field.value}
            onChange={field.onChange}
            errors={errors.when}
          />
        )}
      />
    </SectionForm>
  );
}

const whereFormSchema = z.object({ location: locationSchema });

function WhereForm({ event, locked }: { event: EventItem; locked: boolean }) {
  const { isPending, save } = useSave(event.id, "Location saved");
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useSectionForm(whereFormSchema, { location: locationValuesOf(event.location) });

  return (
    <SectionForm
      title="Where"
      description="A venue, a meeting link, both, or neither yet. Only attendees and staff see it. Changing it on a published event tells its attendees."
      locked={locked}
      isPending={isPending}
      isDirty={isDirty}
      onSubmit={handleSubmit((values) => save({ location: locationOf(values.location) }))}
    >
      <Controller
        control={control}
        name="location"
        render={({ field }) => (
          <LocationFields
            idPrefix="where"
            value={field.value}
            onChange={field.onChange}
            errors={errors.location}
          />
        )}
      />
    </SectionForm>
  );
}

const attendanceSchema = z
  .object({
    type: z.enum(["public", "private"]),
    limited: z.boolean(),
    capacity: z.string().trim(),
    notifications: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (!values.limited) return;
    const n = Number(values.capacity);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "Enter a whole number, 1 or more",
      });
    }
  });

function AttendanceForm({ event, locked }: { event: EventItem; locked: boolean }) {
  const { isPending, save } = useSave(event.id, "Settings saved");
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useSectionForm(attendanceSchema, {
    type: event.settings.type,
    limited: event.settings.capacity !== null,
    capacity: event.settings.capacity === null ? "" : String(event.settings.capacity),
    notifications: event.settings.notifications,
  });
  const limited = useWatch({ control, name: "limited" });

  return (
    <SectionForm
      title="Attendance"
      locked={locked}
      isPending={isPending}
      isDirty={isDirty}
      onSubmit={handleSubmit((values) =>
        save({
          settings: {
            type: values.type,
            capacity: values.limited ? Number(values.capacity) : null,
            notifications: values.notifications,
          },
        }),
      )}
    >
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SettingRow
            id="event-type"
            label="Event type"
            hint="Public events let any member register. Private events are by grant only. People already going stay either way."
            controlClassName="sm:w-64"
          >
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{TYPE_LABEL.public}</SelectItem>
                <SelectItem value="private">{TYPE_LABEL.private}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        )}
      />
      <Controller
        control={control}
        name="limited"
        render={({ field }) => (
          <SettingRow
            id="limited"
            label="Limit places"
            hint="Every grant counts, on either type. Lowering it removes no one."
          >
            <Switch id="limited" checked={field.value} onCheckedChange={field.onChange} />
          </SettingRow>
        )}
      />
      {limited ? (
        <Field id="capacity" label="Capacity" required error={errors.capacity?.message}>
          <Input
            id="capacity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="sm:w-40"
            aria-invalid={Boolean(errors.capacity)}
            {...register("capacity")}
          />
        </Field>
      ) : null}
      <Controller
        control={control}
        name="notifications"
        render={({ field }) => (
          <SettingRow
            id="notifications"
            label="Notifications"
            hint="Tell attendees when they're added, before it starts, and when it changes or is canceled."
          >
            <Switch id="notifications" checked={field.value} onCheckedChange={field.onChange} />
          </SettingRow>
        )}
      />
    </SectionForm>
  );
}

const recordingFormSchema = z.object({ recording: recordingSchema, replay: z.boolean() });

function RecordingForm({ event, locked }: { event: EventItem; locked: boolean }) {
  const { isPending, save } = useSave(event.id, "Recording saved");
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useSectionForm(recordingFormSchema, {
    recording: recordingValuesOf(event.recording),
    replay: event.settings.replay,
  });

  return (
    <SectionForm
      title="Recording"
      description="A link to the recording, once there is one."
      locked={locked}
      isPending={isPending}
      isDirty={isDirty}
      onSubmit={handleSubmit((values) =>
        save({ recording: recordingOf(values.recording), settings: { replay: values.replay } }),
      )}
    >
      <Field id="recording-url" label="Recording link" error={errors.recording?.url?.message}>
        <Input
          id="recording-url"
          type="url"
          placeholder="https://"
          aria-invalid={Boolean(errors.recording?.url)}
          {...register("recording.url")}
        />
      </Field>
      <Field
        id="recording-details"
        label="Recording details"
        hint="Such as a passcode."
        error={errors.recording?.details?.message}
      >
        <Textarea
          id="recording-details"
          rows={2}
          aria-invalid={Boolean(errors.recording?.details)}
          {...register("recording.details")}
        />
      </Field>
      <Controller
        control={control}
        name="replay"
        render={({ field }) => (
          <SettingRow
            id="replay"
            label="Replay"
            hint="Attendees get the recording after the end. Off keeps it to staff."
          >
            <Switch id="replay" checked={field.value} onCheckedChange={field.onChange} />
          </SettingRow>
        )}
      />
    </SectionForm>
  );
}

export function EventDetails({ event }: { event: EventItem }) {
  const locked = event.status === "canceled";
  return (
    <div className="flex flex-col gap-8">
      {locked ? (
        <p className="text-sm text-ink-3">This event is canceled, so it can&apos;t be changed.</p>
      ) : null}
      <SettingsSurface>
        <BasicsForm event={event} locked={locked} />
        <WhenForm event={event} locked={locked} />
        <WhereForm event={event} locked={locked} />
        <AttendanceForm event={event} locked={locked} />
        <RecordingForm event={event} locked={locked} />
      </SettingsSurface>
    </div>
  );
}
