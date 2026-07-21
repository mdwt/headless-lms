"use client";

import * as React from "react";
import { toast } from "sonner";

import editorModule from "@/editor.config";

import { saveActivityContentAction } from "../../../actions";

const { validate, meta } = editorModule;

interface ActivityEditorValue {
  courseId: string;
  moduleId: string;
  activityId: string;
  /** The stored config blob (`null` → start empty). */
  initialConfig: unknown;
  /** Validate + persist a config as the activity's `settings.content`. */
  save: (config: unknown) => Promise<void>;
  /** Editor change feed — keeps the latest config for `saveNow`. */
  onChange: (config: unknown) => void;
  /** Save the latest edited config (header save button). */
  saveNow: () => Promise<void>;
  saving: boolean;
}

const ActivityEditorContext = React.createContext<ActivityEditorValue | null>(null);

/**
 * Client boundary for the editor route. The RSC page feeds it the resolved
 * route/activity data once; everything below reads from context via
 * `useActivityEditor()` instead of prop-drilling params.
 */
export function ActivityEditorProvider({
  courseId,
  moduleId,
  activityId,
  initialConfig,
  children,
}: Omit<ActivityEditorValue, "onChange" | "save" | "saveNow" | "saving"> & {
  children: React.ReactNode;
}) {
  const latestConfig = React.useRef<unknown>(initialConfig);
  const [saving, setSaving] = React.useState(false);

  const save = React.useCallback(
    async (config: unknown) => {
      setSaving(true);
      try {
        if (validate) {
          const result = validate(config);
          if (!result.ok) throw new Error(`Invalid editor config: ${result.errors.join("; ")}`);
        }
        await saveActivityContentAction(courseId, moduleId, activityId, {
          config,
          type: meta.type,
          version: meta.version,
        });
        toast.success("Saved");
      } catch (err) {
        toast.error("Couldn't save content", { description: (err as Error).message });
      } finally {
        setSaving(false);
      }
    },
    [courseId, moduleId, activityId],
  );

  const onChange = React.useCallback((config: unknown) => {
    latestConfig.current = config;
  }, []);

  const saveNow = React.useCallback(() => save(latestConfig.current), [save]);

  const value = React.useMemo(
    () => ({
      courseId,
      moduleId,
      activityId,
      initialConfig,
      save,
      onChange,
      saveNow,
      saving,
    }),
    [courseId, moduleId, activityId, initialConfig, save, onChange, saveNow, saving],
  );

  return <ActivityEditorContext.Provider value={value}>{children}</ActivityEditorContext.Provider>;
}

export function useActivityEditor(): ActivityEditorValue {
  const ctx = React.useContext(ActivityEditorContext);
  if (!ctx) throw new Error("useActivityEditor must be used inside <ActivityEditorProvider>");
  return ctx;
}
