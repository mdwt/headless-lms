import { BarChart3 } from "lucide-react";

// Analytics tab: completion + engagement for the course. No reporting endpoint
// is wired for a single course yet, so this ships as a placeholder.
export default function CourseAnalyticsTab() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
        <BarChart3 className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-medium tracking-tight text-ink">Analytics coming soon</h2>
        <p className="max-w-[44ch] text-pretty text-sm text-ink-3">
          Completion rates, engagement, and drop-off for this course will appear here once
          reporting is connected.
        </p>
      </div>
    </div>
  );
}
