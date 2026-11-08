"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createEventAction } from "../actions";
import {
  EMPTY_LOCATION,
  TYPE_LABEL,
  locationOf,
  locationSchema,
  timesOf,
  whenSchema,
} from "../_lib/event-form";
import { addMinutes, browserTimeZone, defaultStart } from "../_lib/event-time";
import { LocationFields } from "./location-fields";
import { WhenFields } from "./when-fields";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Keep it under 120 characters"),
  when: whenSchema,
  location: locationSchema,
  type: z.enum(["public", "private"]),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "event-form";

function blank(): FormValues {
  const start = defaultStart();
  return {
    title: "",
    when: { start, end: addMinutes(start, 60), timeZone: browserTimeZone() },
    location: EMPTY_LOCATION,
    type: "public",
  };
}

export function EventFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      when: { start: "", end: "", timeZone: "UTC" },
      location: EMPTY_LOCATION,
      type: "public",
    },
  });

  useEffect(() => {
    if (open) reset(blank());
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const event = await createEventAction({
          title: values.title.trim(),
          ...timesOf(values.when),
          location: locationOf(values.location),
          settings: { type: values.type },
        });
        toast.success("Event created");
        onOpenChange(false);
        router.push(`/events/${event.id}`);
      } catch (e) {
        toast.error("Couldn't create event", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New event"
      description="Create a draft event. Publish it when it's ready for members."
      formId={FORM_ID}
      submitLabel="Create event"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field id="event-title" label="Title" required error={errors.title?.message}>
          <Input
            id="event-title"
            placeholder="e.g. Conversation practice"
            autoFocus
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
        </Field>

        <Controller
          control={control}
          name="when"
          render={({ field }) => (
            <WhenFields
              idPrefix="event-when"
              value={field.value}
              onChange={field.onChange}
              errors={errors.when}
            />
          )}
        />

        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <LocationFields
              idPrefix="event-location"
              value={field.value}
              onChange={field.onChange}
              errors={errors.location}
            />
          )}
        />

        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Field
              id="event-type"
              label="Event type"
              hint="Public events let any member register. Private events are by grant only."
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
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
