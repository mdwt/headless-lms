"use client";

import { ChevronLeft, ChevronRight, Download, FileType } from "lucide-react";

const PDF_LINES = ["100%", "94%", "97%", "88%", "100%", "72%", "95%", "90%", "60%"];

/** PDF viewer card with a faux page (handoff §10). */
export function PdfLesson({
  fileName,
  page,
  pageCount,
  onPrev,
  onNext,
  onDownload,
}: {
  fileName: string;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div
        className="flex items-center justify-between gap-3 border-b border-line-divider px-[18px] py-3"
        style={{ background: "#fbfaf7" }}
      >
        <div className="flex items-center gap-2.5 text-ink-2">
          <FileType className="size-[18px] text-brand" />
          <span className="text-[13.5px] font-semibold" style={{ color: "#33312c" }}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous page"
            className="flex size-[30px] items-center justify-center rounded-lg border border-ring-conic bg-surface text-ink-2 hover:bg-hover-surface"
          >
            <ChevronLeft className="size-[15px]" />
          </button>
          <span className="min-w-[62px] text-center text-[12px] text-ink-2">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next page"
            className="flex size-[30px] items-center justify-center rounded-lg border border-ring-conic bg-surface text-ink-2 hover:bg-hover-surface"
          >
            <ChevronRight className="size-[15px]" />
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="ml-2 inline-flex items-center gap-[7px] rounded-lg bg-brand px-3.5 py-[7px] text-[13px] font-semibold text-white"
          >
            <Download className="size-[15px]" />
            Download
          </button>
        </div>
      </div>
      <div className="flex justify-center px-7 py-7" style={{ background: "#efeee9" }}>
        <div
          className="w-full max-w-[520px] rounded-[4px] border border-[#e2dfd7] bg-surface"
          style={{ aspectRatio: "8.5 / 11", padding: "42px 44px", boxShadow: "0 8px 30px -16px rgba(0,0,0,0.2)" }}
        >
          <div className="mb-1.5 text-[22px] font-semibold">Composition Studies</div>
          <div className="mb-[26px] text-[10.5px] tracking-[0.04em] text-ink-faint">
            Worksheet · Module 2
          </div>
          {PDF_LINES.map((w, i) => (
            <div
              key={i}
              className="mb-[13px] h-[9px] rounded-[3px]"
              style={{ background: "#edece7", width: w }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
