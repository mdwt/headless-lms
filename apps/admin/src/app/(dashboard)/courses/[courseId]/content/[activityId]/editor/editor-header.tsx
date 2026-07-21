"use client";

import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useActivityEditor } from "./editor-context";

/** Compact action bar above the document: back, title, preview, save. */
export function EditorHeader({ title }: { title: string }) {
  const { courseId, activityId, saveNow, saving } = useActivityEditor();

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Back to curriculum">
        <Link href={`/courses/${courseId}/content`}>
          <ArrowLeft />
        </Link>
      </Button>

      <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</h2>

      <Button asChild variant="ghost" size="sm">
        <Link href={`/courses/${courseId}/content/${activityId}/preview`}>
          <Eye />
          Preview
        </Link>
      </Button>

      <Button variant="primary" size="sm" disabled={saving} onClick={() => void saveNow()}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
