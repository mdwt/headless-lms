"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { Automation } from "@/lib/api/types";

import { listCommunityNotificationsAction, setAutomationEnabledAction } from "../../actions";

export function NotificationsDialog({
  communityId,
  open,
  onOpenChange,
}: {
  communityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<Automation[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCommunityNotificationsAction(communityId)
      .then((automations) => {
        if (!cancelled) setRows(automations);
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error("Couldn't load notifications", { description: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, communityId]);

  function toggle(automation: Automation, enabled: boolean) {
    setRows((prev) => prev?.map((a) => (a.id === automation.id ? { ...a, enabled } : a)) ?? prev);
    startTransition(async () => {
      try {
        await setAutomationEnabledAction(automation.id, enabled);
      } catch (err) {
        setRows(
          (prev) =>
            prev?.map((a) => (a.id === automation.id ? { ...a, enabled: !enabled } : a)) ?? prev,
        );
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-6 p-6">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            What this community tells people, in the app and by email. Turning one off stops it for
            everyone.
          </DialogDescription>
        </DialogHeader>

        <ul role="list" className="-mx-2 flex max-h-[60vh] flex-col overflow-y-auto">
          {rows === null
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-6 px-2 py-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-2/5 rounded-full" />
                    <Skeleton className="h-3 w-3/4 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </li>
              ))
            : rows.map((automation) => (
                <li
                  key={automation.id}
                  className="flex items-start justify-between gap-6 rounded-lg px-2 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <label
                      htmlFor={`notification-${automation.id}`}
                      className="text-sm font-medium text-ink"
                    >
                      {automation.name}
                    </label>
                    {automation.description ? (
                      <p className="text-sm text-pretty text-ink-3">{automation.description}</p>
                    ) : null}
                  </div>
                  <Switch
                    id={`notification-${automation.id}`}
                    checked={automation.enabled}
                    onCheckedChange={(enabled) => toggle(automation, enabled)}
                    className="mt-0.5"
                  />
                </li>
              ))}
          {rows?.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-ink-3">
              This community sends no notifications.
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
