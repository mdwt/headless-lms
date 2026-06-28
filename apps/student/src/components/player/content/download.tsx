"use client";

import { Download } from "lucide-react";

/** Download resource card (handoff §10). */
export function DownloadLesson({
  fileName,
  fileMeta,
  onDownload,
}: {
  fileName: string;
  fileMeta: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-line bg-surface p-[30px] text-center">
      <div className="mb-[18px] flex size-[62px] items-center justify-center rounded-[14px] bg-brand-soft text-brand">
        <Download className="size-7" />
      </div>
      <div className="mb-[5px] text-[20px] font-semibold">{fileName}</div>
      <div className="mb-[22px] text-[12px] text-ink-3">{fileMeta}</div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex items-center gap-[9px] rounded-full bg-brand px-6 py-3 text-[14.5px] font-semibold text-white hover:bg-brand-strong"
      >
        <Download className="size-[17px]" />
        Download files
      </button>
    </div>
  );
}
