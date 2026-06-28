"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { NameAvatar } from "@/components/ui/avatar";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { useGradeSubmission } from "@/lib/api/hooks";
import { formatDate, relativeTime } from "@/lib/format";
import type { Submission } from "@/lib/api/types";

const FORM_ID = "grade-submission-form";

function buildSchema(pointsPossible: number) {
  return z.object({
    score: z.coerce
      .number({ error: "Enter a score" })
      // The API contract requires a whole-number score; match it client-side so
      // a fractional value fails validation here instead of as a 400.
      .int("Enter a whole number")
      .min(0, "Score can't be negative")
      .max(pointsPossible, `Score can't exceed ${pointsPossible}`),
    feedback: z.string().trim().min(1, "Feedback is required"),
  });
}

type GradeValues = { score: number; feedback: string };

export function GradeSheet({
  submission,
  open,
  onOpenChange,
}: {
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const grade = useGradeSubmission();
  const pointsPossible = submission?.pointsPossible ?? 100;

  const schema = React.useMemo(() => buildSchema(pointsPossible), [pointsPossible]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GradeValues>({
    resolver: zodResolver(schema),
    defaultValues: { score: undefined as unknown as number, feedback: "" },
  });

  // Re-seed the form whenever a different submission opens.
  React.useEffect(() => {
    if (submission && open) {
      reset({
        score: submission.score ?? (undefined as unknown as number),
        feedback: submission.feedback ?? "",
      });
    }
  }, [submission, open, reset]);

  if (!submission) return null;

  const onSubmit = handleSubmit(async (values) => {
    await grade.mutateAsync({
      id: submission.id,
      score: values.score,
      feedback: values.feedback,
    });
    onOpenChange(false);
  });

  const alreadyGraded = submission.status === "graded";

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={alreadyGraded ? "Update grade" : "Grade submission"}
      description={submission.assessmentTitle}
      formId={FORM_ID}
      submitLabel={alreadyGraded ? "Update grade" : "Submit grade"}
      pending={grade.isPending}
    >
      <div className="flex flex-col gap-6">
        {/* Submission context */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <NameAvatar name={submission.studentName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{submission.studentName}</p>
              <p className="truncate text-sm text-ink-3">{submission.studentEmail}</p>
            </div>
            <div className="ml-auto shrink-0">
              <SubmissionStatusBadge status={submission.status} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-4">Course</dt>
              <dd className="truncate text-ink-2">{submission.courseTitle}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-4">Points possible</dt>
              <dd className="text-ink-2">{pointsPossible}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-4">Submitted</dt>
              <dd className="text-ink-2" title={formatDate(submission.submittedAt)}>
                {relativeTime(submission.submittedAt)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-4">Assessment</dt>
              <dd className="truncate text-ink-2">{submission.assessmentTitle}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink-2">Student response</p>
            <div className="max-h-56 overflow-y-auto rounded-lg bg-surface-2 p-3 text-sm text-pretty text-ink-2">
              {submission.responsePreview}
            </div>
          </div>
        </div>

        <Separator />

        {/* Grading form */}
        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field
            id="score"
            label="Score"
            required
            error={errors.score?.message}
            hint={`Out of ${pointsPossible} points`}
          >
            <Input
              id="score"
              type="number"
              inputMode="numeric"
              min={0}
              max={pointsPossible}
              step={1}
              placeholder="0"
              {...register("score")}
            />
          </Field>

          <Field id="feedback" label="Feedback" required error={errors.feedback?.message}>
            <Textarea
              id="feedback"
              rows={5}
              placeholder="Explain the grade and how the student can improve…"
              {...register("feedback")}
            />
          </Field>
        </form>
      </div>
    </FormSheet>
  );
}
