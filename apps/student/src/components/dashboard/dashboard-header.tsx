import { Bell, Search } from "lucide-react";

/** Sticky dashboard header (handoff §1): brand · search · bell · avatar. */
export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line-strong px-7 py-4 backdrop-blur-[10px] [background:rgba(247,246,243,0.86)]">
      <div className="flex items-center gap-[11px]">
        <div className="grid size-7 place-items-center rounded-[8px] bg-brand text-[16px] font-semibold text-brand-contrast">
          A
        </div>
        <span className="text-[20px] font-semibold tracking-[-0.01em]">Atelier</span>
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
        <div className="grid size-[38px] place-items-center rounded-full bg-brand-soft text-[12.5px] font-bold text-brand">
          MV
        </div>
      </div>
    </header>
  );
}
