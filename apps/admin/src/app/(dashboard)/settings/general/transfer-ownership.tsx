"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/api/types";

import { transferOwnershipAction } from "../team/actions";

const schema = z.object({
  newOwnerOrgUserId: z.string().min(1, "Select the new owner"),
  previousOwnerRoleKey: z.string().min(1, "Select your new role"),
});

type FormValues = z.infer<typeof schema>;

export function TransferOwnership({
  candidates,
  roles,
  defaultRoleKey,
}: {
  candidates: { id: string; name: string; email: string }[];
  roles: OrgRole[];
  defaultRoleKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<FormValues | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newOwnerOrgUserId: "", previousOwnerRoleKey: defaultRoleKey },
  });

  const options = useMemo(
    () => candidates.map((c) => ({ value: c.id, label: c.name, description: c.email })),
    [candidates],
  );

  const newOwner = candidates.find((c) => c.id === confirming?.newOwnerOrgUserId);
  const nextRole = roles.find((r) => r.key === confirming?.previousOwnerRoleKey);

  function transfer() {
    if (!confirming) return;
    const values = confirming;
    startTransition(async () => {
      try {
        await transferOwnershipAction(values);
        toast.success("Ownership transferred", { description: newOwner?.name });
        setConfirming(null);
        router.refresh();
      } catch (e) {
        toast.error("Couldn't transfer ownership", { description: (e as Error).message });
      }
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit(setConfirming)} noValidate>
        <SettingsSection
          title="Transfer ownership"
          description="Make another active team member the owner. You keep the org role you pick here."
          footer={
            <Button type="submit" variant="destructive" disabled={candidates.length === 0}>
              Transfer ownership
            </Button>
          }
        >
          <Controller
            control={control}
            name="newOwnerOrgUserId"
            render={({ field }) => (
              <Field
                id="new-owner"
                label="New owner"
                required
                error={errors.newOwnerOrgUserId?.message}
                hint={candidates.length === 0 ? "There's no other active team member." : undefined}
              >
                <Combobox
                  id="new-owner"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={options}
                  placeholder="Select a team member"
                  searchPlaceholder="Search by name or email…"
                  emptyText="No team members match"
                  disabled={candidates.length === 0}
                  aria-invalid={!!errors.newOwnerOrgUserId}
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="previousOwnerRoleKey"
            render={({ field }) => (
              <Field
                id="previous-owner-role"
                label="Your new org role"
                required
                error={errors.previousOwnerRoleKey?.message}
              >
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="previous-owner-role"
                    aria-invalid={!!errors.previousOwnerRoleKey}
                  >
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </SettingsSection>
      </form>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Transfer ownership?"
        description={`${newOwner?.name ?? "They"} becomes the owner of this organization and you become ${nextRole?.name ?? "a member"}. Only the new owner can transfer it back.`}
        confirmLabel="Transfer ownership"
        pending={pending}
        onConfirm={transfer}
      />
    </>
  );
}
