import {
  GraduationCap,
  LayoutDashboard,
  Image,
  Library,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api/types";
import { visibleNav } from "@/lib/roles";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  /** Destination for leaf items; omitted for expandable sections. */
  href?: string;
  label: string;
  icon: LucideIcon;
  key: keyof ReturnType<typeof visibleNav>;
  /** Present = the item expands into a submenu instead of linking anywhere. */
  children?: NavChild[];
}

const ALL_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "overview" },
  {
    label: "Content",
    icon: Library,
    key: "courses",
    children: [
      { href: "/courses", label: "Courses" },
      { href: "/downloads", label: "Downloads" },
      { href: "/bundles", label: "Bundles" },
    ],
  },
  { href: "/media", label: "Media", icon: Image, key: "media" },
  { href: "/students", label: "Students", icon: GraduationCap, key: "students" },
  {
    label: "Automations",
    icon: Workflow,
    key: "automations",
    children: [
      { href: "/automations/workflows", label: "Workflows" },
      { href: "/automations/webhooks", label: "Webhooks" },
    ],
  },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
];

/** Filter nav by what the role is allowed to see. */
export function navForRole(role: Role): NavItem[] {
  const vis = visibleNav(role);
  return ALL_NAV.filter((item) => vis[item.key]);
}
