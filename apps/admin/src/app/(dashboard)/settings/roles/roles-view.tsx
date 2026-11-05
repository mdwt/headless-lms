"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OrgRole } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { groupPermissions, type PermissionDefinition } from "@/lib/permissions";

import { renameRoleAction } from "./actions";

const FORM_ID = "rename-role-form";

const LEVEL_LABEL: Record<OrgRole["levels"][number], string> = {
  org: "The whole org",
  course: "One course",
  download: "One download",
  community: "One community",
};

const schema = z.object({
  name: z.string().trim().min(1, "Give the role a name").max(60),
  description: z.string().trim().max(300),
});

type FormValues = z.infer<typeof schema>;

export function RolesView({
  roles,
  catalogue,
  canRename,
}: {
  roles: OrgRole[];
  catalogue: PermissionDefinition[];
  canRename: boolean;
}) {
  const [renaming, setRenaming] = useState<OrgRole | null>(null);

  return (
    <SettingsSurface>
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-ink">Roles</h2>
        <p className="text-sm text-pretty text-ink-3">
          A role is a named set of permissions. It is given on the whole org, or on one course,
          download or community. Renaming a role keeps everyone who holds it.
        </p>
      </section>
      {roles.map((role) => (
        <RoleSection
          key={role.key}
          role={role}
          catalogue={catalogue}
          onRename={canRename ? () => setRenaming(role) : undefined}
        />
      ))}
      <RenameRoleDialog role={renaming} onOpenChange={(open) => !open && setRenaming(null)} />
    </SettingsSurface>
  );
}

function RoleSection({
  role,
  catalogue,
  onRename,
}: {
  role: OrgRole;
  catalogue: PermissionDefinition[];
  onRename?: () => void;
}) {
  const groups = groupPermissions(
    catalogue,
    role.permissions.map((key) => ({ key })),
  );
  const holders = `${formatNumber(role.holders)} ${role.holders === 1 ? "holder" : "holders"}`;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{role.name}</h3>
            {role.system ? <Badge variant="brand">System role</Badge> : null}
            {role.added ? <Badge variant="outline">Added by the org</Badge> : null}
            {role.team ? <Badge variant="neutral">Team</Badge> : null}
          </div>
          {role.description ? (
            <p className="text-sm text-pretty text-ink-3">{role.description}</p>
          ) : null}
          <p className="text-xs text-ink-4">
            {holders} · Given on{" "}
            {role.levels
              .map((l) => LEVEL_LABEL[l])
              .join(", ")
              .toLowerCase()}
          </p>
        </div>
        {onRename ? (
          <Button variant="secondary" size="sm" onClick={onRename}>
            Rename
          </Button>
        ) : null}
      </header>

      {groups.length === 0 ? (
        <p className="text-sm text-ink-3">
          Holds no permissions. What a holder opens is decided by the access they&apos;re granted.
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.group} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <dt className="w-32 shrink-0 text-sm font-medium text-ink-2">{group.label}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <Badge key={item.key} variant="outline" title={item.definition.description}>
                    {item.definition.label}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function RenameRoleDialog({
  role,
  onOpenChange,
}: {
  role: OrgRole | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (role) reset({ name: role.name, description: role.description });
  }, [role, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!role) return;
    startTransition(async () => {
      try {
        await renameRoleAction({ key: role.key, ...values });
        toast.success("Role renamed", { description: values.name });
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error("Couldn't rename role", { description: (e as Error).message });
      }
    });
  });

  return (
    <FormDialog
      open={role !== null}
      onOpenChange={onOpenChange}
      title="Rename role"
      description="Everyone who holds this role keeps it. Badges and emails show the new name."
      formId={FORM_ID}
      submitLabel="Save"
      pending={pending}
      submitDisabled={!isDirty}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="role-name" label="Name" required error={errors.name?.message}>
          <Input id="role-name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field id="role-description" label="Description" error={errors.description?.message}>
          <Textarea id="role-description" rows={3} {...register("description")} />
        </Field>
      </form>
    </FormDialog>
  );
}
