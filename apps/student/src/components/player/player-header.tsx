"use client";

import Link from "next/link";
import { ArrowLeft, PanelLeft } from "lucide-react";

import { ProgressRing } from "@/components/primitives/progress-ring";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { initials } from "@/lib/format";

/** Sticky course-player header (handoff §8). Brand initial is the portal org's. */
export function PlayerHeader({
  courseTitle,
  coursePercent,
  doneCount,
  total,
  studentInitials,
  orgName,
  sidebarActive,
  onBack,
  onToggleSidebar,
}: {
  courseTitle: string;
  coursePercent: number;
  doneCount: number;
  total: number;
  studentInitials: string;
  orgName: string;
  sidebarActive: boolean;
  onBack: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header
      className="z-30 flex flex-none items-center justify-between gap-4 border-b border-line-strong px-5 py-3"
      style={{ background: "#fbfaf8" }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div
          className="grid size-7 flex-none place-items-center rounded-[8px] bg-brand text-[15px] font-semibold text-brand-contrast"
          title={orgName}
        >
          {initials(orgName).charAt(0)}
        </div>
        <Link
          href="/"
          onClick={onBack}
          className="inline-flex flex-none items-center gap-[7px] rounded-[9px] px-[11px] py-2 text-[13.5px] font-medium text-ink-2 hover:bg-hover-surface-2"
        >
          <ArrowLeft className="size-[17px]" />
          <span className="whitespace-nowrap">Library</span>
        </Link>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle curriculum"
          title="Toggle curriculum"
          className="flex size-9 flex-none items-center justify-center rounded-[9px] hover:bg-hover-surface-2"
          style={{ color: sidebarActive ? "var(--brand)" : "#6f6d66" }}
        >
          <PanelLeft className="size-[19px]" />
        </button>
        <div className="mx-1.5 h-[22px] w-px flex-none bg-ring-conic" />
        <span className="truncate text-[16.5px] font-semibold tracking-[-0.005em]">
          {courseTitle}
        </span>
      </div>

      <div className="flex flex-none items-center gap-4">
        <div className="flex items-center gap-2.5">
          <ProgressRing
            percent={coursePercent}
            size={30}
            innerClassName="bg-surface-warm"
          />
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[12.5px] font-medium">
              {doneCount}/{total}
            </span>
            <span className="text-[10.5px] text-ink-4">lessons</span>
          </div>
        </div>
        <div className="flex size-[34px] items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {studentInitials}
        </div>
        <SignOutButton className="grid size-[34px] place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-hover-surface-2 disabled:opacity-50" />
      </div>
    </header>
  );
}
