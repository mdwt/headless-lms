import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { getPermissions } from "@/lib/auth/server-permissions";
import { requireAuth } from "@/lib/auth/server-session";

export const BUILDER_PANELS = ["curriculum", "blocks", "settings"] as const;
export type BuilderPanel = (typeof BUILDER_PANELS)[number];

export function panelFromParam(value: string | undefined): BuilderPanel | "none" | undefined {
  if (value === "none") return "none";
  return BUILDER_PANELS.find((panel) => panel === value);
}

export async function loadActivity(courseId: string, activityId: string) {
  await requireAuth();
  if (!(await getPermissions()).has("courses:write", courseId)) return null;

  const [course, modules] = await Promise.all([
    serverApi.getCourse(courseId),
    serverApi.moduleTree(courseId),
  ]);
  const parent = modules.find((m) => m.activities.some((a) => a.id === activityId));
  const activity = parent?.activities.find((a) => a.id === activityId);
  if (!parent || !activity) notFound();

  return { course, modules, parent, activity };
}
