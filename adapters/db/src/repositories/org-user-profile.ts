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
import { sql } from "drizzle-orm";
import { orgUsers } from "../schema/organizations.js";
import { userProfiles, users } from "../schema/identity.js";
import { user } from "../schema/better-auth.js";

/** Spread into a `.select({ ... })` to get the profile columns. */
export const orgUserProfileColumns = {
  id: orgUsers.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  image: user.image,
};

export const authorProfileColumns = {
  ...orgUserProfileColumns,
  role: orgUsers.role,
  displayName: userProfiles.displayName,
  headline: userProfiles.headline,
  imageAssetOrgId: userProfiles.imageAssetOrgId,
  imageAssetId: userProfiles.imageAssetId,
};

// A person is shared across organizations. Until an invited student accepts,
// the inviting org sees the name and avatar only when the profile is its own:
// no account yet and no other organization.
const profileVisible = sql`(${orgUsers.status} <> 'invited' or (${users.externalId} is null and not exists (
  select 1 from org_users other where other.user_id = ${users.id} and other.org_id <> ${orgUsers.orgId}
)))`;

export const studentFirstName = sql<
  string | null
>`case when ${profileVisible} then ${users.firstName} end`;
export const studentLastName = sql<
  string | null
>`case when ${profileVisible} then ${users.lastName} end`;

export const studentProfileColumns = {
  id: orgUsers.id,
  firstName: studentFirstName,
  lastName: studentLastName,
  email: users.email,
  image: sql<string | null>`case when ${profileVisible} then ${user.image} end`,
};
