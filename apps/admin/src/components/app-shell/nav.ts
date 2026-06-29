import {
  GraduationCap,
  LayoutDashboard,
  Image,
  Library,
  Plug,
  Ticket,
  Users,
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
  { href: "/courses", label: "Courses", icon: Library, key: "courses" },
  { href: "/media", label: "Media", icon: Image, key: "media" },
  { href: "/students", label: "Students", icon: GraduationCap, key: "students" },
  { href: "/enrollments", label: "Enrollments", icon: Ticket, key: "enrollments" },
{ href: "/team", label: "Team", icon: Users, key: "team" },
  { href: "/connected-apps", label: "Connected Apps", icon: Plug, key: "connectedApps" },
];

/** Filter nav by what the role is allowed to see. */
export function navForRole(role: Role): NavItem[] {
  const vis = visibleNav(role);
  return ALL_NAV.filter((item) => vis[item.key]);
}
