/**
 * Client-side composition over the bare-model API. The contract serves each
 * table as its own resource (modules, activities, activity→asset links,
 * entitlement grants); anything shaped for display — trees, joins, derived
 * status, settings defaults — is assembled here, never server-side.
 */

import type {
  Activity,
  ActivityAssetLink,
  ActivityNode,
  Course,
  CourseSettings,
  EntitlementGrant,
  EntitlementStatus,
  Module,
  ModuleTree,
} from "./types";

/** Compose the module→activity tree from the three bare lists. */
export function buildModuleTree(
  modules: Module[],
  activities: Activity[],
  links: ActivityAssetLink[],
): ModuleTree[] {
  const assetsByActivity = new Map<string, string[]>();
  for (const link of links) {
    const ids = assetsByActivity.get(link.activityId) ?? [];
    ids.push(link.assetId);
    assetsByActivity.set(link.activityId, ids);
  }
  const nodesByModule = new Map<string, ActivityNode[]>();
  for (const activity of activities) {
    const nodes = nodesByModule.get(activity.moduleId) ?? [];
    nodes.push({ ...activity, assetIds: assetsByActivity.get(activity.id) ?? [] });
    nodesByModule.set(activity.moduleId, nodes);
  }
  return modules.map((m) => ({ ...m, activities: nodesByModule.get(m.id) ?? [] }));
}

/** A course's settings — served complete, defaults filled server-side. */
export function courseSettingsOf(course: Course): CourseSettings {
  return course.settings;
}

/** active|expired|revoked — revoked wins; an elapsed expiry reads as expired. */
export function entitlementStatusOf(grant: EntitlementGrant): EntitlementStatus {
  if (grant.status === "revoked") return "revoked";
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}
