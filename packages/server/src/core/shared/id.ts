import KSUID from 'ksuid';

/**
 * Prefixed, KSUID-bodied string ids — `${prefix}_${ksuid}`, e.g. `org_2QZ4mK...`.
 *
 * The body is a real KSUID (27-char base62, 4-byte timestamp + 16 random bytes),
 * so ids are lexicographically time-sortable. The prefix marks the entity type at
 * a glance. A core utility (one implementation, nothing to swap), called directly
 * by core services and used as the Drizzle `.$defaultFn` for every domain id column.
 */
export const ID_PREFIXES = {
  organization: 'org',
  user: 'usr',
  student: 'stu',
  membership: 'orm',
  invitation: 'ivt',
  courseAssignment: 'asn',
  course: 'crs',
  module: 'mod',
  activity: 'act',
  activityAsset: 'aca',
  asset: 'ast',
  enrollment: 'enr',
  progress: 'prg',
  credential: 'crd',
  connection: 'con',
  event: 'evt',
} as const;

export type IdType = keyof typeof ID_PREFIXES;

/** A bare KSUID body (27-char base62, time-sortable), no prefix. */
export function ksuid(): string {
  return KSUID.randomSync().string;
}

/** Attach an arbitrary prefix to a fresh KSUID — `${prefix}_${ksuid}`. */
export function prefixId(prefix: string): string {
  return `${prefix}_${ksuid()}`;
}

/** Generate a prefixed, time-sortable id for the given domain entity type. */
export function genId(type: IdType): string {
  return prefixId(ID_PREFIXES[type]);
}

/** True when `value` carries the prefix for `type` (shape check only, not existence). */
export function isId(type: IdType, value: string): boolean {
  return value.startsWith(`${ID_PREFIXES[type]}_`);
}
