"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import { Switch } from "@/components/ui/switch";
import type { SpaceSettings } from "@/lib/api/types";

import { updateSpaceAction } from "../../../../../actions";

const RULES: { key: keyof SpaceSettings; label: string; hint: string }[] = [
  {
    key: "requireReview",
    label: "Review before publishing",
    hint: "Hold members' posts until staff or a moderator approves them.",
  },
  { key: "comments", label: "Comments", hint: "Let members comment on posts." },
  { key: "reactions", label: "Reactions", hint: "Let members react to posts." },
];

export function PostRules({
  communityId,
  spaceId,
  settings,
}: {
  communityId: string;
  spaceId: string;
  settings: SpaceSettings;
}) {
  const [value, setValue] = useState(settings);
  const [isPending, startTransition] = useTransition();

  function update(key: keyof SpaceSettings, checked: boolean) {
    const previous = value;
    setValue({ ...value, [key]: checked });
    startTransition(async () => {
      try {
        const space = await updateSpaceAction(communityId, spaceId, {
          settings: { [key]: checked },
        });
        setValue(space.settings);
      } catch (err) {
        setValue(previous);
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection title="Posts" description="The defaults for every post in this space.">
      {RULES.map(({ key, label, hint }) => (
        <SettingRow key={key} id={`space-${key}`} label={label} hint={hint}>
          <Switch
            id={`space-${key}`}
            checked={value[key]}
            disabled={isPending}
            onCheckedChange={(checked) => update(key, checked)}
          />
        </SettingRow>
      ))}
    </SettingsSection>
  );
}
