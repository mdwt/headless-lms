# Billing — Domain Spec

> **Status: DEFERRED — not implemented.** Current scope has no billing. Enrollment is by grant only (see entitlements). This spec describes the eventual paid flow.

Owns money: orders, transactions, payment. Distinct from access.

## Scope

- Owns the **financial record**: orders, transactions, refunds, subscription state.
- Integrates with the payment provider (Stripe) behind a port.
- Triggers access changes (grant on purchase, revoke on refund) but does not own access.
- Does **not** own access (entitlements), what's sold (offers), or content.

## Model

- **Order** — student, offer purchased, amount, status, provider order id.
- **Transaction** — payment/refund record against an order.
- **Subscription** — recurring billing state (if applicable).

## Money is not access

A transaction records that payment happened; the resulting access is owned by entitlements. The two are not 1:1 — refunds, comps, and manual grants break the mapping. Billing emits/triggers; entitlements decides access.

## Boundaries

1. **billing ↔ offers**
   - *offers* owns pricing.
   - *billing* prices a checkout from the offer.
   - Connection: billing reads offer price.

2. **billing → entitlements**
   - On completed purchase, billing triggers enrollment; on refund, triggers revocation.
   - Connection: post-purchase flow (synchronous on completion, or event-driven). Billing does not grant access itself.

3. **billing ↔ payment adapter**
   - *adapter* (Stripe) is an outbound port implementation.
   - Connection: billing depends on a payment port; the Stripe adapter implements it. Webhook verification lives in the HTTP adapter, delegating to billing.

4. **billing ↔ identity**
   - References student id.
   - Connection: reference only.

## Events

- `order.created`, `order.paid`, `order.refunded`
- `payment.succeeded`, `payment.failed`
- `subscription.created`, `subscription.cancelled`
