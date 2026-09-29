import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

export const BUILDER_PANELS = ["curriculum", "blocks", "settings"] as const;
export type BuilderPanel = (typeof BUILDER_PANELS)[number];

export function panelFromParam(value: string | undefined): BuilderPanel | "none" | undefined {
  if (value === "none") return "none";
  return BUILDER_PANELS.find((panel) => panel === value);
}

export async function loadActivity(courseId: string, activityId: string) {
  const coursePromise = serverApi.getCourse(courseId);
  const modulesPromise = serverApi.moduleTree(courseId);
  const session = await requireAuth(coursePromise, modulesPromise);
  if (!isManager(session.role)) {
    void coursePromise.catch(() => {});
    void modulesPromise.catch(() => {});
    return null;
  }

  const [course, modules] = await Promise.all([coursePromise, modulesPromise]);
  const parent = modules.find((m) => m.activities.some((a) => a.id === activityId));
  const activity = parent?.activities.find((a) => a.id === activityId);
  if (!parent || !activity) notFound();

  return { course, modules, parent, activity };
}
