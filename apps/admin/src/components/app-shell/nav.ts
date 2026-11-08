import {
  GraduationCap,
  LayoutDashboard,
  Image,
  Library,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Permission, Permissions } from "@/lib/permissions";

export interface NavChild {
  href: string;
  label: string;
  needs?: Permission[];
}

export interface NavItem {
  /** Destination for leaf items; omitted for expandable sections. */
  href?: string;
  label: string;
  icon: LucideIcon;
  key: string;
  needs?: Permission[];
  /** Present = the item expands into a submenu instead of linking anywhere. */
  children?: NavChild[];
}

const ALL_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "overview" },
  {
    label: "Content",
    icon: Library,
    key: "content",
    children: [
      { href: "/courses", label: "Courses", needs: ["courses:read"] },
      { href: "/downloads", label: "Downloads", needs: ["downloads:read"] },
      {
        href: "/communities",
        label: "Communities",
        needs: ["communities:read", "communities:moderate"],
      },
      { href: "/events", label: "Events", needs: ["events:read"] },
      { href: "/bundles", label: "Bundles", needs: ["bundles:read"] },
    ],
  },
  { href: "/media", label: "Media", icon: Image, key: "media", needs: ["media:read"] },
  {
    href: "/students",
    label: "Students",
    icon: GraduationCap,
    key: "students",
    needs: ["people:read"],
  },
  {
    label: "Automations",
    icon: Workflow,
    key: "automations",
    children: [
      { href: "/automations/workflows", label: "Workflows", needs: ["automations:read"] },
      { href: "/automations/webhooks", label: "Webhooks", needs: ["automations:read"] },
    ],
  },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
];

/** The nav items the person's permissions reach, anywhere in the org. */
export function navFor(permissions: Permissions): NavItem[] {
  const reaches = (needs?: Permission[]) => !needs || permissions.anywhereAny(needs);
  return ALL_NAV.flatMap((item) => {
    if (!reaches(item.needs)) return [];
    if (!item.children) return [item];
    const children = item.children.filter((child) => reaches(child.needs));
    return children.length > 0 ? [{ ...item, children }] : [];
  });
}
