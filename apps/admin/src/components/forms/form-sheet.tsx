"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Standardized create/edit slide-over. Every entity form uses this so the CRUD
 * pattern is identical: header, scrollable body (the form fields), and a footer
 * with Cancel + a pending-aware submit button. Wrap your `<form>` so the footer
 * submit works, by giving the form an `id` and pointing the button at it.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  formId,
  submitLabel = "Save",
  pending = false,
  submitDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  formId: string;
  submitLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={pending || submitDisabled}
          >
            {pending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
