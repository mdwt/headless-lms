"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { EditorSlot } from "@headless-lms/editor";

type HostSlots = Partial<Record<EditorSlot, HTMLElement | null>>;

const HostSlotsContext = createContext<HostSlots>({});

export function HostSlotsProvider({ children, slots }: { children: ReactNode; slots: HostSlots }) {
  return <HostSlotsContext.Provider value={slots}>{children}</HostSlotsContext.Provider>;
}

export function useHostSlots(): HostSlots {
  return useContext(HostSlotsContext);
}

export function useFixedToolbar(): boolean {
  return Boolean(useContext(HostSlotsContext).toolbar);
}
