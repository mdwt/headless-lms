"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserCog } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContentType, OrgRole } from "@/lib/api/types";

import { assignRoleAction, unassignRoleAction } from "@/app/(dashboard)/settings/team/actions";

const FORM_ID = "give-item-role-form";

export type ItemRoleRow = {
  orgUserId: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
};

export type LitePerson = { id: string; name: string; email: string };

const schema = z.object({
  orgUserId: z.string().min(1, "Select a person"),
  roleKey: z.string().min(1, "Select a role"),
});

type FormValues = z.infer<typeof schema>;

export function ItemRolesPanel({
  contentId,
  contentType,
  contentNoun,
  rows,
  roles,
  people,
  canWrite,
  memberIds,
}: {
  contentId: string;
  contentType: ContentType;
  contentNoun: string;
  rows: ItemRoleRow[];
  roles: OrgRole[];
  people: LitePerson[];
  canWrite: boolean;
  memberIds?: string[] | null;
}) {
  const router = useRouter();
  const [giving, setGiving] = useState(false);
  const [removing, setRemoving] = useState<ItemRoleRow | null>(null);
  const [pending, startTransition] = useTransition();
  const members = useMemo(() => (memberIds ? new Set(memberIds) : null), [memberIds]);
  const community = contentType === "community";
  const offered = roles.filter((r) => r.levels.includes(contentType));
  const canGive = canWrite && offered.length > 0;

  function onRemove(row: ItemRoleRow) {
    startTransition(async () => {
      try {
        await unassignRoleAction(row.orgUserId, contentId);
        toast.success("Role removed", { description: row.name });
        setRemoving(null);
        router.refresh();
      } catch (e) {
        toast.error("Couldn't remove role", { description: (e as Error).message });
      }
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            People with roles here
          </h2>
          <p className="text-sm text-pretty text-ink-3">
            A role given on this {contentNoun} applies to this {contentNoun} only, on top of the
            person&apos;s org role.
          </p>
        </div>
        {canGive ? (
          <Button variant="primary" size="sm" onClick={() => setGiving(true)}>
            Give a role
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
            <UserCog className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-medium tracking-tight text-ink">No roles given here</h3>
            <p className="max-w-[44ch] text-sm text-pretty text-ink-3">
              People given a role on this {contentNoun} will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium whitespace-nowrap text-ink-3">
                  <th scope="col" className="px-3 pb-3">
                    Person
                  </th>
                  <th scope="col" className="px-3 pb-3">
                    Role
                  </th>
                  <th scope="col" className="px-3 pb-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.orgUserId} className="border-t border-line align-middle">
                    <td className="px-3 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{row.name}</span>
                        <span className="text-ink-4">{row.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{row.roleName}</Badge>
                        {community && members && !members.has(row.orgUserId) ? (
                          <Badge variant="warning">Not a member yet</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      {canWrite ? (
                        <Button variant="ghost" size="sm" onClick={() => setRemoving(row)}>
                          Remove
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canGive ? (
        <GiveRoleDialog
          open={giving}
          onOpenChange={setGiving}
          contentId={contentId}
          contentNoun={contentNoun}
          community={community}
          members={members}
          roles={offered}
          people={people}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove role?"
        description={
          removing
            ? `${removing.name} loses the ${removing.roleName} role on this ${contentNoun}. Their org role stays as it is.`
            : ""
        }
        confirmLabel="Remove role"
        pending={pending}
        onConfirm={() => removing && onRemove(removing)}
      />
    </section>
  );
}

function GiveRoleDialog({
  open,
  onOpenChange,
  contentId,
  contentNoun,
  community,
  members,
  roles,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentId: string;
  contentNoun: string;
  community: boolean;
  members: Set<string> | null;
  roles: OrgRole[];
  people: LitePerson[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaults: FormValues = { orgUserId: "", roleKey: roles[0]?.key ?? "" };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open) reset({ orgUserId: "", roleKey: roles[0]?.key ?? "" });
  }, [open, reset, roles]);

  const options = useMemo(
    () => people.map((p) => ({ value: p.id, label: p.name, description: p.email })),
    [people],
  );

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        await assignRoleAction({ ...values, contentId });
        const person = people.find((p) => p.id === values.orgUserId);
        const description = !community
          ? person?.name
          : members === null
            ? "A community role applies while they're a member of the community."
            : members.has(values.orgUserId)
              ? person?.name
              : `${person?.name ?? "They"} isn't a member of this community yet. The role applies once they have access.`;
        toast.success("Role given", { description });
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error("Couldn't give role", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give a role"
      description={`Give someone a role on this ${contentNoun}. It replaces any role they already hold here.`}
      formId={FORM_ID}
      submitLabel="Give role"
      pending={pending}
      submitDisabled={people.length === 0}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="orgUserId"
          render={({ field }) => (
            <Field id="item-role-person" label="Person" required error={errors.orgUserId?.message}>
              <Combobox
                id="item-role-person"
                value={field.value}
                onValueChange={field.onChange}
                options={options}
                placeholder="Select a person"
                searchPlaceholder="Search by name or email…"
                emptyText="No people match"
                aria-invalid={!!errors.orgUserId}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="roleKey"
          render={({ field }) => (
            <Field
              id="item-role-role"
              label="Role"
              required
              error={errors.roleKey?.message}
              hint={roles.find((r) => r.key === field.value)?.description || undefined}
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="item-role-role" aria-invalid={!!errors.roleKey}>
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
      </form>
    </FormDialog>
  );
}
