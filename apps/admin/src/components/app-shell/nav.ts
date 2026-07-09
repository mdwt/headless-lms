import {
  GraduationCap,
  LayoutDashboard,
  Image,
  Library,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api/types";
import { visibleNav } from "@/lib/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  key: keyof ReturnType<typeof visibleNav>;
}

const ALL_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "overview" },
  { href: "/courses", label: "Content", icon: Library, key: "courses" },
  { href: "/media", label: "Media", icon: Image, key: "media" },
  { href: "/students", label: "Students", icon: GraduationCap, key: "students" },
  { href: "/settings", label: "Settings", icon: Settings, key: "settings" },
];

/** Filter nav by what the role is allowed to see. */
export function navForRole(role: Role): NavItem[] {
  const vis = visibleNav(role);
  return ALL_NAV.filter((item) => vis[item.key]);
}
