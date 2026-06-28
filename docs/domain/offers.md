# Offers — Domain Spec

> **Status: DEFERRED — not implemented.** Tied to billing, which is out of current scope. Enrollment is by grant only (see entitlements). This spec describes the eventual paid flow.

Owns what is sold and at what price. Decoupled from content and from access.

## Scope

- Owns the **sellable unit**: an offer, its pricing, and what it grants.
- Decoupled from content — one piece of content can be sold via many offers.
- Does **not** own access (entitlements), payment (billing), or content (courses).

## Model

- **Offer** — title, pricing (one-time / subscription / payment plan), status, what it grants (one or more products/courses).
- **Price** — amount, currency, billing type.
- Grant link: offer → product(s)/course(s).

## Offer vs content

An offer is the sellable thing; content is the deliverable. Price lives on the offer, not the course. This lets one course be sold many ways without touching the content model.

## Boundaries

1. **offers ↔ courses**
   - *courses* owns content.
   - *offers* references the product/course an offer grants.
   - Connection: reference by id.

2. **offers → billing**
   - *billing* prices a checkout from an offer.
   - Connection: billing reads the offer's price.

3. **offers → entitlements**
   - *entitlements* references the offer a grant is for and looks up what it grants.
   - Connection: entitlements reads offer → granted products.

## Events

- `offer.created`, `offer.updated`, `offer.published`
