/**
 * Slug helpers. Kept out of React components so the unique-suffix generation
 * (which reads the clock) doesn't trip the react-hooks purity rule.
 */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** A reasonably unique slug for a new organization; the server enforces final uniqueness. */
export function uniqueOrgSlug(name: string): string {
  const suffix = Date.now().toString(36).slice(-5);
  return `${slugify(name) || "org"}-${suffix}`;
}
