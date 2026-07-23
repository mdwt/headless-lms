"use client";

import { Check } from "lucide-react";
import { useApp } from "@/lib/store";

/** Bottom-center toast pill (handoff: dark bg, accent check, auto-dismiss ~2.4s). */
export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
      style={{ animation: "fadeUp 0.2s ease" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-toast px-4 py-2.5 text-[13.5px] font-medium text-white shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)] dark:shadow-none dark:inset-ring dark:inset-ring-white/10">
        <span className="grid size-[18px] place-items-center rounded-full bg-brand">
          <Check className="size-3 text-brand-contrast" strokeWidth={2.6} />
        </span>
        {toast.message}
      </div>
    </div>
  );
}
