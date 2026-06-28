# Entitlements — Domain Spec

Owns access truth: who can access what, and whether it's valid. Distinct from payment and from completion.

> **Current scope: enrollment by grant only.** Billing is deferred, so grants are created directly (comp / manual / free) — `enroll()` grants access to a course with no order or payment. The offers/billing boundaries below describe the eventual paid flow and are not built now. Until offers exists, a grant references the **course** directly rather than an offer/product.

## Scope

- Owns the **access grant**: a student's entitlement to a product/offer, its validity, and its lifecycle.
- Owns the `enroll()` use case (create an entitlement) and access checks.
- Owns access-resolution: "what can this student access right now," composing entitlement state + course gating rules + progress.
- Does **not** own money (billing), content (courses), or completion (progress).

## Model

- **Entitlement** — student, what it grants (product/offer), status (active/expired/revoked), source (purchase/comp/manual), origin order (nullable), granted_at, access_start, expires_at (nullable = lifetime).
- Access link is to the product/offer (what grants access). Origin order is provenance only and may be absent (comp, manual grant).

## Access is not payment

A payment and an entitlement are not 1:1. Comps and manual grants create access with no order; refunds revoke access for an existing order. Entitlement state is owned here, driven by access events, not inferred from billing.

## Boundaries

1. **entitlements ↔ offers**
   - *offers* owns what's sold and what an offer grants.
   - *entitlements* references the offer/product the grant is for.
   - Connection: reference + lookup of what an offer grants.

2. **billing → entitlements**
   - *billing* owns payment; on a completed purchase it triggers enrollment.
   - *entitlements* grants access in response.
   - Connection: post-purchase flow (synchronous on checkout completion, or event-driven fan-out). On refund, billing triggers revocation.

3. **entitlements → courses/progress (access-resolution)**
   - *entitlements* owns the grant and its access_start.
   - To resolve what's unlocked now, it reads *courses* gating rules (drip relative to access_start, unlock-on-completion) and *progress* (what's complete).
   - Connection: entitlements composes the answer by reading both. Drip math uses access_start (owned here); unlock rules read progress.

4. **entitlements ↔ identity**
   - *identity* owns the student.
   - *entitlements* references student id.
   - Connection: reference only.

## Events

- `entitlement.granted`
- `entitlement.revoked`
- `entitlement.expired`
- `enrollment.created`

## Relationship to progress (distinct domains)

Access (entitlements) and completion (progress) move independently: enrolled with zero progress; full progress with expired access. Progress references that access exists; it does not own it. Entitlements references completion (for gating); it does not own it.
