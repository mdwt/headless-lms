import { Bell, Search } from "lucide-react";

import { initials } from "@/lib/format";
import { UserMenu } from "@/components/user-menu";

/** Sticky dashboard header (handoff §1): brand · search · bell · user menu.
 *  Brand is the portal org's name/initial (per-org, not hardcoded). */
export function DashboardHeader({
  studentName,
  studentEmail,
  orgName,
}: {
  studentName: string;
  studentEmail: string;
  orgName: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line-strong bg-page/85 px-7 py-4 backdrop-blur-[10px]">
      <div className="flex items-center gap-[11px]">
        <div className="grid size-7 place-items-center rounded-[8px] bg-brand text-[16px] font-semibold text-brand-contrast">
          {initials(orgName).charAt(0)}
        </div>
        <span className="text-[20px] font-semibold tracking-[-0.01em]">{orgName}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex w-[210px] items-center gap-2 rounded-full border border-line bg-surface px-[15px] py-2 text-[13.5px] text-ink-4">
          <Search className="size-4 shrink-0" strokeWidth={1.7} />
          <span>Search courses</span>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-hover-surface"
        >
          <Bell className="size-[18px]" strokeWidth={1.7} />
        </button>
        <UserMenu name={studentName} email={studentEmail} />
      </div>
    </header>
  );
}
