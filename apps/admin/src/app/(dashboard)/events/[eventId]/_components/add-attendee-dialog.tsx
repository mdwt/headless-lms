"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

import { addEventAttendeeAction } from "../../actions";

export type LitePerson = { id: string; name: string; email: string };

const FORM_ID = "add-attendee-form";

const schema = z.object({
  orgUserId: z.string().min(1, "Pick a person"),
});

type FormValues = z.infer<typeof schema>;

function AddAttendeeDialog({
  open,
  onOpenChange,
  eventId,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  people: LitePerson[];
}) {
  const [pending, startTransition] = useTransition();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { orgUserId: "" } });

  useEffect(() => {
    if (open) reset({ orgUserId: "" });
  }, [open, reset]);

  const options = useMemo(
    () => people.map((p) => ({ value: p.id, label: p.name, description: p.email })),
    [people],
  );

  const onSubmit = handleSubmit((values) => {
    const person = people.find((p) => p.id === values.orgUserId);
    startTransition(async () => {
      try {
        await addEventAttendeeAction(eventId, values.orgUserId);
        toast.success(`${person?.name ?? "They"} added`);
        onOpenChange(false);
      } catch (e) {
        toast.error("Couldn't add attendee", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add people"
      description="They're granted the event and told they're going."
      formId={FORM_ID}
      submitLabel="Add"
      pending={pending}
      submitDisabled={people.length === 0}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="orgUserId"
          render={({ field }) => (
            <Field
              id="orgUserId"
              label="Person"
              required
              error={errors.orgUserId?.message}
              hint={people.length === 0 ? "Everyone is already going." : undefined}
            >
              <Combobox
                id="orgUserId"
                value={field.value}
                onValueChange={field.onChange}
                options={options}
                placeholder="Select a person"
                searchPlaceholder="Search by name or email…"
                emptyText="No one matches"
                disabled={people.length === 0}
                aria-invalid={Boolean(errors.orgUserId)}
              />
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}

export function AddAttendeeButton({
  eventId,
  people,
  blockedReason,
}: {
  eventId: string;
  people: LitePerson[];
  blockedReason: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {blockedReason ? <span className="text-sm text-ink-4">{blockedReason}</span> : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={blockedReason !== null}
      >
        Add people
      </Button>
      <AddAttendeeDialog open={open} onOpenChange={setOpen} eventId={eventId} people={people} />
    </div>
  );
}
