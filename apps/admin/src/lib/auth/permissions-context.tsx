"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { permissionsOf, type MyPermissions, type Permissions } from "../permissions";

const PermissionsContext = createContext<Permissions | null>(null);

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: MyPermissions;
  children: ReactNode;
}) {
  const value = useMemo(() => permissionsOf(permissions), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Permissions {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within the dashboard");
  return ctx;
}
