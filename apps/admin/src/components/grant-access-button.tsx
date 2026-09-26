"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { GrantAccessDialog, type LiteStudent } from "./grant-access-dialog";

/** Opens the content-scoped grant sheet — the Access tab's only interactive bit. */
export function GrantAccessButton({
  contentId,
  contentNoun,
  students,
  variant = "primary",
}: {
  contentId: string;
  contentNoun: string;
  students: LiteStudent[];
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        Grant access
      </Button>
      <GrantAccessDialog
        open={open}
        onOpenChange={setOpen}
        contentId={contentId}
        contentNoun={contentNoun}
        students={students}
      />
    </>
  );
}
