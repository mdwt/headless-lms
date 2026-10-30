import { Lock, Mail, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SpaceAccessRule } from "@/lib/api/types";

export const ACCESS_RULES: { value: SpaceAccessRule; label: string; hint: string }[] = [
  {
    value: "all_members",
    label: "All members",
    hint: "Everyone who holds the community can open it.",
  },
  {
    value: "by_request",
    label: "By request",
    hint: "Members see it and ask to join. Staff or a moderator approves.",
  },
  {
    value: "by_invite",
    label: "By invite",
    hint: "Only invited people can open it. Everyone else doesn't see it.",
  },
];

export const ACCESS_LABEL: Record<SpaceAccessRule, string> = {
  all_members: "All members",
  by_request: "By request",
  by_invite: "By invite",
};

const ACCESS_ICON = { all_members: Users, by_request: Lock, by_invite: Mail } as const;

export function SpaceAccessBadge({ rule }: { rule: SpaceAccessRule }) {
  const Icon = ACCESS_ICON[rule];
  return (
    <Badge variant={rule === "all_members" ? "neutral" : "outline"} className="py-0.5 pr-2 pl-1.5">
      <Icon />
      {ACCESS_LABEL[rule]}
    </Badge>
  );
}
