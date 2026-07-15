import { Badge, Dot } from "@/components/ui/badge";
import { ROLE_LABEL } from "@/lib/roles";
import type {
  CourseStatus,
  EntitlementStatus,
  IntegrationStatus,
  MemberStatus,
  Role,
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
  children: React.ReactNode;
}) {
  return (
    <Badge variant={variant} className="pl-1.5">
      {dot && <Dot className={cn(DOT[variant])} />}
      {children}
    </Badge>
  );
}

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return status === "published" ? (
    <StatusBadge variant="success" dot>
      Published
    </StatusBadge>
  ) : (
    <StatusBadge variant="neutral" dot>
      Draft
    </StatusBadge>
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

export function RoleBadge({ role }: { role: Role }) {
  const variant = role === "owner" ? "brand" : role === "admin" ? "neutral" : "outline";
  return <Badge variant={variant as "brand" | "neutral" | "outline"}>{ROLE_LABEL[role]}</Badge>;
}
