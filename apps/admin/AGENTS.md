# apps/admin — UI conventions

Read one existing file of the kind you're about to write **before** writing it. The
patterns below are already implemented; copy them, don't re-derive them.

## Forms

Canonical examples: `src/app/(dashboard)/courses/[courseId]/settings/_components/basics-form.tsx`
(page form) and `src/app/(dashboard)/students/_components/add-student-dialog.tsx` (dialog form).

- `react-hook-form` + `zodResolver`. The Zod schema is a module-level `const schema`
  above the component; `type FormValues = z.infer<typeof schema>`.
- Every field is wrapped in `Field` from `@/components/forms/field` — it owns the
  label, required marker, hint, and error line. Never hand-roll a
  `<Label>` + control + `<p>{error}</p>` group.
- **Page forms are borderless single-column sections** — no cards, no bordered
  wrappers, no rails. The `<form>` wraps a `SettingsSection` from
  `@/components/forms/settings-section`: optional heading + description above,
  fields filling the column, and the submit button(s) in the `footer` prop
  (right-aligned under the fields, `disabled={isPending || !isDirty}`). Omit the
  heading when it would repeat the active tab's label.
- **`SettingsSurface` is the outermost element of every form surface**, even a
  single-section one. It is the one left-aligned `max-w-3xl` column and owns the
  single hairline between stacked sections (each section or its wrapping
  `<form>` a direct child). Never add another `max-w-*` inside it.
- Pages, detail pages included, fill the shell's `max-w-7xl` column and stay
  left-aligned. Only form surfaces are capped, by `SettingsSurface`.
- Label-left/control-right settings (switches, compact selects) are `SettingRow`s
  as section children. Stacked inputs are `Field`s; side-by-side pairs use a
  `grid grid-cols-1 gap-5 sm:grid-cols-2`.
- Dialog forms use `FormDialog` from `@/components/forms/form-dialog`: give the
  `<form>` an `id`, pass the same string as `formId`, fields in a
  `flex flex-col gap-5`. `FormDialog` renders the header, Cancel, and the
  pending-aware submit — do not build a `Dialog` + `DialogFooter` + submit
  button by hand.
- Submit path: server action → `toast.success(...)` (sonner) → `router.refresh()`.
  Failure → `toast.error("Couldn't …", { description: (err as Error).message })`.
  Typed failures (e.g. `ApiError` 409) go to `setError("field", …)`, not a toast.

## Layout and styling

- **Do not use `Card` / `CardHeader` / `CardContent`.** Admin does not lay out
  content in cards. `src/components/ui/card.tsx` exists but is used in exactly two
  places, neither of them a form. Forms and settings are never boxed — a titled
  group is a borderless `SettingsSection`; the only line on a settings surface is
  the hairline `SettingsSurface` puts between sections.
- Do not invent bordered/rounded wrappers with ad-hoc utilities. Containers come
  from an existing component; if a new one is genuinely needed it uses the tokens
  below, not raw greys or `rounded-lg`.
- Colours are semantic tokens only: `text-ink` / `ink-2` / `ink-3` / `ink-4`,
  `border-line` / `line-strong`, `bg-surface` / `surface-2` / `surface-3`,
  `text-danger`. Never `text-gray-500`, `border-gray-200`, `bg-white`, or a hex.
- Radius: `rounded-card` for panels, the control default for inputs/buttons. No
  arbitrary `rounded-[…]`.
- `Button` variants in this app are the local ones (`primary`, `ghost`, …) — check
  `src/components/ui/button.tsx` rather than assuming upstream shadcn variants.
- Spacing between stacked elements is a `flex flex-col gap-*`, not margins on children.
