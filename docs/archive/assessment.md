> **Archived 2026-06-29.** Describes a removed/never-built feature (assessment & grading were cut from scope). Kept for history; not implemented in the codebase.

# Assessment — Domain Spec

A peer context owning all assessment types. Owns **outcome**, not completion.

## Scope

- One context, all assessment types (quiz, assignment, …). Types differ by grading mechanic (auto vs human); handled inside.
- Owns the **outcome**: passed/failed, scored — computed per type's rules.
- Does **not** own completion. That is progress's concern.

## Model

- **Quiz** — pass %, attempt limit, time limit, randomization, pool size.
- **Question** — stem, type, points.
- **Option** — choices + answer key (never exposed to student client).
- **Attempt** — student's run: started, submitted, score, pass/fail.
- **Response** — answer per question within an attempt.

## Boundaries

Each boundary names what each side owns and how they connect.

1. **assessment ↔ courses**
   - *courses* owns curriculum structure and the ordered slots in a module. A slot may hold a reference to an assessment.
   - *assessment* owns the assessment itself (questions, rules, attempts). It has no concept of modules or ordering.
   - Connection: courses references assessment by id in a slot. Courses never reads questions; assessment never reads structure.

2. **assessment → progress**
   - *assessment* owns the **outcome** — did the student pass/fail, what score. It computes this per the type's rules and **emits** it.
   - *progress* owns the **completion fact** — that the student has completed this curriculum item. It consumes the assessment's outcome event and records completion (applying the item's rule, e.g. "passed" vs "attempted").
   - Connection: an event (`quiz.passed`). Assessment never writes to progress; progress never reads assessment internals. Outcome → completion is the boundary.

3. **progress → gating**
   - *progress* owns completion state and exposes "what has this student completed."
   - *gating* (in entitlements/access-resolution) owns unlock rules ("module unlocks when item X is complete") and reads progress to evaluate them.
   - Connection: gating reads progress only. Because assessment already fed progress, gating never touches assessment. Chain: assessment → progress → gating.

4. **assessment ↔ identity**
   - *identity* owns the student.
   - *assessment* references the student id on attempts/submissions.
   - Connection: reference only, not ownership.

## Events

- `quiz.passed`, `quiz.failed`
