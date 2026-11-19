"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrgApp } from "@/lib/api/types";

import { deleteAppAction } from "./actions";
import { AppDialog } from "./app-dialog";

export function AppsView({ apps, canEdit }: { apps: OrgApp[]; canEdit: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ open: boolean; app?: OrgApp }>({ open: false });
  const [target, setTarget] = useState<OrgApp | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      try {
        await deleteAppAction(id);
        toast.success("App deleted");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't delete the app", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="Apps"
        description="The frontends your organization runs, each on its own domain. Members sign in on an app's domain, and links in emails, invites and calendar files open the app that serves what the link is about. An organization has at most one app for courses and one for the community; one app can serve both."
        footer={
          canEdit ? (
            <Button variant="primary" onClick={() => setDialog({ open: true })}>
              Add app
            </Button>
          ) : undefined
        }
      >
        {apps.length === 0 ? (
          <p className="text-sm text-ink-3">
            No apps. Without one, members have nowhere to sign in and links have nowhere to open.
          </p>
        ) : (
          apps.map((app) => (
            <div key={app.id} className="flex flex-col gap-2">
              <SettingRow id={`app-${app.id}`} label={app.name} hint={app.domain}>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" onClick={() => setDialog({ open: true, app })}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setTarget(app)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </SettingRow>
              <div className="flex flex-wrap gap-1.5">
                {app.courses ? <Badge variant="outline">Courses</Badge> : null}
                {app.community ? <Badge variant="outline">Community</Badge> : null}
                <Badge variant="outline" className="font-mono">
                  {app.slug}
                </Badge>
              </div>
            </div>
          ))
        )}
      </SettingsSection>

      {canEdit ? (
        <AppDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
          app={dialog.app}
        />
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Delete ${target?.name ?? "this app"}?`}
        description={`Members can no longer sign in at ${target?.domain ?? "its domain"}, and links stop opening it.`}
        confirmLabel="Delete app"
        destructive
        pending={pending}
        onConfirm={onConfirm}
      />
    </SettingsSurface>
  );
}
