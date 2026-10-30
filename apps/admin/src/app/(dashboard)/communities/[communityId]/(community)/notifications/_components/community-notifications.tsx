"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Automation } from "@/lib/api/types";

import { setAutomationEnabledAction } from "../../../../actions";

export function CommunityNotifications({ automations }: { automations: Automation[] }) {
  const [, startTransition] = useTransition();
  const [rows, setOptimistic] = useOptimistic(
    automations,
    (state: Automation[], patch: { id: string; enabled: boolean }) =>
      state.map((a) => (a.id === patch.id ? { ...a, enabled: patch.enabled } : a)),
  );

  function toggle(automation: Automation, enabled: boolean) {
    startTransition(async () => {
      setOptimistic({ id: automation.id, enabled });
      try {
        await setAutomationEnabledAction(automation.id, enabled);
        toast.success(enabled ? `${automation.name} turned on` : `${automation.name} turned off`);
      } catch (err) {
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
        <Bell className="size-5 text-ink-3" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium tracking-tight text-ink">No notifications</h2>
          <p className="max-w-[44ch] text-sm text-pretty text-ink-3">
            This community has no notification automations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="Notifications"
        description="What this community tells people, in the app and by email. Each person chooses how they're told; turning one off here stops it for everyone."
      >
        <ul role="list" className="flex flex-col divide-y divide-line">
          {rows.map((automation) => (
            <li
              key={automation.id}
              className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={`automation-${automation.id}`}
                    className="text-sm font-medium text-ink"
                  >
                    {automation.name}
                  </label>
                  {automation.source === "user" && <Badge variant="outline">Custom</Badge>}
                </div>
                {automation.description ? (
                  <p className="text-sm text-pretty text-ink-4">{automation.description}</p>
                ) : null}
                <Link
                  href={`/automations/workflows/${automation.id}`}
                  className="w-fit rounded-sm text-sm text-ink-3 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Edit steps
                </Link>
              </div>
              <Switch
                id={`automation-${automation.id}`}
                checked={automation.enabled}
                onCheckedChange={(enabled) => toggle(automation, enabled)}
              />
            </li>
          ))}
        </ul>
      </SettingsSection>
    </SettingsSurface>
  );
}
