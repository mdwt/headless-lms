// reporting/students — read model over identity + entitlements + progress. Framework-free.

export interface Student {
  readonly id: string;
  name: string;
  email: string;
  image?: string | null;
  entitlementCount: number;
  avgProgress: number;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface StudentsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
