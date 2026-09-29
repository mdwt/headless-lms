"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Trash2 } from "lucide-react";

import { Field } from "@/components/forms/field";
import { SettingRow } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ActivityFormValues } from "./activity-builder";

const COMPLETION_LABELS: Record<ActivityFormValues["completion"], string> = {
  view: "When opened",
  video: "When the video is watched",
  manual: "When the student marks it complete",
};

const OVERRIDE_LABELS: Record<ActivityFormValues["comments"], string> = {
  inherit: "Inherit from course",
  always: "Always allow",
  never: "Never allow",
};

export function ActivitySettingsPanel({
  form,
  courseTranscriptDownloads,
  courseCommentsEnabled,
  onDelete,
}: {
  form: UseFormReturn<ActivityFormValues>;
  courseTranscriptDownloads: boolean;
  courseCommentsEnabled: boolean;
  onDelete: () => void;
}) {
  const { control } = form;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-6">
        <SettingRow
          id="activity-published"
          label="Published"
          hint="Draft activities stay hidden from enrolled students."
        >
          <Controller
            control={control}
            name="published"
            render={({ field }) => (
              <Switch
                id="activity-published"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </SettingRow>

        <Field
          id="activity-completion"
          label="Mark complete"
          hint="What counts as finishing this activity."
        >
          <Controller
            control={control}
            name="completion"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-completion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPLETION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          id="activity-transcripts"
          label="Transcript downloads"
          hint={`The course currently ${courseTranscriptDownloads ? "allows" : "blocks"} transcript downloads.`}
        >
          <Controller
            control={control}
            name="transcriptDownloads"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-transcripts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OVERRIDE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          id="activity-comments"
          label="Comments"
          hint={`The course currently has comments ${courseCommentsEnabled ? "on" : "off"}. Turning them off here overrides the course; it cannot turn them back on.`}
        >
          <Controller
            control={control}
            name="comments"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-comments">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OVERRIDE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 />
          Delete activity
        </Button>
      </div>
    </div>
  );
}
