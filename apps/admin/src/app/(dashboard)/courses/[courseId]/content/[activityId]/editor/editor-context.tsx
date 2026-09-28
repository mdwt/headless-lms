"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import editorModule from "@/editor.config";

import { saveActivityContentAction } from "../../../actions";
import { useRegisterSave } from "../_components/activity-bar-context";

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
  /** Save the latest edited config (the bar's save button). */
  saveNow: () => Promise<void>;
  saving: boolean;
  /** Edited since the last successful save. */
  dirty: boolean;
}

const ActivityEditorContext = createContext<ActivityEditorValue | null>(null);

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
}: Omit<ActivityEditorValue, "onChange" | "save" | "saveNow" | "saving" | "dirty"> & {
  children: ReactNode;
}) {
  const latestConfig = useRef<unknown>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const save = useCallback(
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
        setDirty(false);
        toast.success("Saved");
      } catch (err) {
        toast.error("Couldn't save content", { description: (err as Error).message });
      } finally {
        setSaving(false);
      }
    },
    [courseId, moduleId, activityId],
  );

  const onChange = useCallback((config: unknown) => {
    latestConfig.current = config;
    setDirty(true);
  }, []);

  const saveNow = useCallback(() => save(latestConfig.current), [save]);

  // The bar lives in the layout above this route, so Content claims its Save.
  useRegisterSave({ save: saveNow, saving, dirty });

  const value = useMemo(
    () => ({
      courseId,
      moduleId,
      activityId,
      initialConfig,
      save,
      onChange,
      saveNow,
      saving,
      dirty,
    }),
    [courseId, moduleId, activityId, initialConfig, save, onChange, saveNow, saving, dirty],
  );

  return <ActivityEditorContext.Provider value={value}>{children}</ActivityEditorContext.Provider>;
}

export function useActivityEditor(): ActivityEditorValue {
  const ctx = useContext(ActivityEditorContext);
  if (!ctx) throw new Error("useActivityEditor must be used inside <ActivityEditorProvider>");
  return ctx;
}
