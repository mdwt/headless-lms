"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { DmSettings } from "@/lib/api/types";

import { patchDmSettingsAction } from "../../../../actions";

type ToggleKey = Exclude<keyof DmSettings, "groupSize">;

const TOGGLES: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "enabled",
    label: "Direct messages",
    hint: "Let people in this community message each other privately.",
  },
  {
    key: "memberToMember",
    label: "Members can message members",
    hint: "Off means members can only message staff.",
  },
  {
    key: "memberToStaff",
    label: "Members can message staff",
    hint: "Owners, admins and instructors.",
  },
  {
    key: "staffToAnyone",
    label: "Staff can message anyone",
    hint: "Including members who haven't messaged them.",
  },
  {
    key: "firstMessageIsRequest",
    label: "First message is a request",
    hint: "The recipient accepts it before the conversation opens.",
  },
  {
    key: "groupChats",
    label: "Group chats",
    hint: "Let people start a chat with three or more people.",
  },
];

const GROUP_SIZE_MIN = 3;
const GROUP_SIZE_MAX = 100;

export function DirectMessageSettings({
  communityId,
  settings,
}: {
  communityId: string;
  settings: DmSettings;
}) {
  const [value, setValue] = useState(settings);
  const [groupSize, setGroupSize] = useState(String(settings.groupSize));
  const [isPending, startTransition] = useTransition();

  function save(patch: Partial<DmSettings>) {
    const previous = value;
    setValue({ ...value, ...patch });
    startTransition(async () => {
      try {
        setValue(await patchDmSettingsAction(communityId, patch));
      } catch (err) {
        setValue(previous);
        setGroupSize(String(previous.groupSize));
        toast.error("Couldn't save", { description: (err as Error).message });
      }
    });
  }

  const size = Number(groupSize);
  const sizeValid = Number.isInteger(size) && size >= GROUP_SIZE_MIN && size <= GROUP_SIZE_MAX;

  function commitGroupSize() {
    if (!sizeValid) {
      setGroupSize(String(value.groupSize));
      return;
    }
    if (size !== value.groupSize) save({ groupSize: size });
  }

  return (
    <SettingsSection
      title="Direct messages"
      description="Private chats between people who hold this community."
    >
      {TOGGLES.map(({ key, label, hint }) => (
        <SettingRow key={key} id={`dm-${key}`} label={label} hint={hint}>
          <Switch
            id={`dm-${key}`}
            checked={value[key]}
            disabled={isPending || (key !== "enabled" && !value.enabled)}
            onCheckedChange={(checked) => save({ [key]: checked })}
          />
        </SettingRow>
      ))}
      <SettingRow
        id="dm-groupSize"
        label="Largest group chat"
        hint={`Most people in one group chat, its creator included. ${GROUP_SIZE_MIN} to ${GROUP_SIZE_MAX}.`}
        error={
          sizeValid ? undefined : `Enter a number from ${GROUP_SIZE_MIN} to ${GROUP_SIZE_MAX}.`
        }
      >
        <Input
          id="dm-groupSize"
          name="groupSize"
          type="number"
          inputMode="numeric"
          min={GROUP_SIZE_MIN}
          max={GROUP_SIZE_MAX}
          className="w-24 tabular-nums"
          value={groupSize}
          disabled={isPending || !value.enabled || !value.groupChats}
          onChange={(e) => setGroupSize(e.target.value)}
          onBlur={commitGroupSize}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitGroupSize();
            }
          }}
        />
      </SettingRow>
    </SettingsSection>
  );
}
