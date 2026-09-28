// The one display join for an org user's profile.
//
// The names and email live on the identity `users` row the org_users row links
// to; the avatar lives on the auth engine's mirrored `user` table, reached
// through that same identity row. The identity join is INNER (user_id is NOT
// NULL); the auth join is LEFT, since only the avatar depends on it.
//
// Sanctioned by .eslintrc.cjs — "db repositories read the auth adapter's
// mirrored `user` table for display joins".
//
// No `joinOrgUserProfile` helper: Drizzle's query builder type narrows on every
// chained call, so a generic wrapper around `.innerJoin(...).leftJoin(...)`
// can't be typed without widening it to `unknown` — each repository chains the
// two joins inline instead.
import { orgUsers } from "../schema/organizations.js";
import { users } from "../schema/identity.js";
import { user } from "../schema/better-auth.js";

/** Spread into a `.select({ ... })` to get the profile columns. */
export const orgUserProfileColumns = {
  id: orgUsers.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  image: user.image,
};
