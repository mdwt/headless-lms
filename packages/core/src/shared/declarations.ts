import type { Permission } from '../types/index.js';

export type Declaration =
  | { readonly permissions: readonly [Permission, ...Permission[]] }
  | 'member'
  | 'system'
  | 'public'
  | 'owner';

type MethodKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

export type Declarations<T> = { readonly [K in MethodKeys<T> & string]: Declaration };

export function requires(...permissions: [Permission, ...Permission[]]): Declaration {
  return { permissions };
}

export function declaredPermissions(declaration: Declaration): readonly Permission[] {
  return typeof declaration === 'string' ? [] : declaration.permissions;
}
