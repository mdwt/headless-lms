import type { ReactNode } from "react";
import { Badge, Dot } from "@/components/ui/badge";
import type {
  AutomationRunStatus,
  CourseStatus,
  EntitlementStatus,
  EventStatus,
  IntegrationStatus,
  MemberStatus,
  ItemRole,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-4",
  brand: "bg-brand",
};

function StatusBadge({
  variant,
  dot,
  children,
}: {
  variant: "neutral" | "brand" | "success" | "warning" | "danger";
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <Badge variant={variant} className="px-2.5">
      {dot && <Dot className={cn(DOT[variant])} />}
      {children}
    </Badge>
  );
}

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return status === "published" ? (
    <StatusBadge variant="success">Published</StatusBadge>
  ) : (
    <StatusBadge variant="neutral">Draft</StatusBadge>
  );
}

export function EventStatusBadge({ status, ended }: { status: EventStatus; ended: boolean }) {
  if (status === "canceled") return <StatusBadge variant="danger">Canceled</StatusBadge>;
  if (ended) return <StatusBadge variant="neutral">Ended</StatusBadge>;
  return status === "published" ? (
    <StatusBadge variant="success">Published</StatusBadge>
  ) : (
    <StatusBadge variant="neutral">Draft</StatusBadge>
  );
}

export function EntitlementStatusBadge({ status }: { status: EntitlementStatus }) {
  const map = {
    active: { variant: "success", label: "Active" },
    expired: { variant: "warning", label: "Expired" },
    revoked: { variant: "danger", label: "Revoked" },
  } as const;
  const { variant, label } = map[status];
  return (
    <StatusBadge variant={variant} dot>
      {label}
    </StatusBadge>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return status === "active" ? (
    <StatusBadge variant="success" dot>
      Active
    </StatusBadge>
  ) : (
    <StatusBadge variant="warning" dot>
      Invited
    </StatusBadge>
  );
}

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "not_connected") {
    return <Badge variant="outline">Not connected</Badge>;
  }
  return status === "connected" ? (
    <StatusBadge variant="success" dot>
      Connected
    </StatusBadge>
  ) : (
    <StatusBadge variant="warning" dot>
      Inactive
    </StatusBadge>
  );
}

export function RoleBadge({
  name,
  isOwner = false,
  team = false,
}: {
  name: string;
  isOwner?: boolean;
  team?: boolean;
}) {
  return <Badge variant={isOwner ? "brand" : team ? "neutral" : "outline"}>{name}</Badge>;
}

const CONTENT_NOUN: Record<ItemRole["contentType"], string> = {
  course: "Course",
  download: "Download",
  community: "Community",
  event: "Event",
};

export function ItemRoleBadges({
  items,
  titles,
}: {
  items: ItemRole[];
  titles: Record<string, string>;
}) {
  if (items.length === 0) return <span className="text-ink-4">—</span>;
  return (
    <div className="flex max-w-[22rem] flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.contentId} variant="outline" className="max-w-full">
          <span className="truncate">
            {item.roleName} · {titles[item.contentId] ?? CONTENT_NOUN[item.contentType]}
          </span>
        </Badge>
      ))}
    </div>
  );
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <StatusBadge variant="success" dot>
      Enabled
    </StatusBadge>
  ) : (
    <StatusBadge variant="neutral" dot>
      Disabled
    </StatusBadge>
  );
}

export function DeliveryStatusBadge({ status }: { status: AutomationRunStatus }) {
  const map = {
    completed: { variant: "success", label: "Delivered" },
    failed: { variant: "danger", label: "Failed" },
    running: { variant: "neutral", label: "Sending" },
  } as const;
  const { variant, label } = map[status];
  return (
    <StatusBadge variant={variant} dot>
      {label}
    </StatusBadge>
  );
}
