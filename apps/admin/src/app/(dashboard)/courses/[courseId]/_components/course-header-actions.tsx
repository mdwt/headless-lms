"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Course } from "@/lib/api/types";

import { setCoursePublishedAction } from "../actions";

// Publish / unpublish toggle for the course header. Client island — the rest of
// the header is server-rendered.
export function CourseHeaderActions({
  courseId,
  status,
}: {
  courseId: string;
  status: Course["status"];
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  if (!can.publishCourse(user)) return null;

  function onTogglePublish() {
    const next: Course["status"] = status === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        await setCoursePublishedAction(courseId, next);
        toast.success(next === "published" ? "Course published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="primary" onClick={onTogglePublish} disabled={isPending}>
        {status === "published" ? "Unpublish" : "Publish"}
      </Button>
    </div>
  );
}
