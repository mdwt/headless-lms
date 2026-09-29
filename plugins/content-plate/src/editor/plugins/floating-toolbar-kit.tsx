"use client";

import { createPlatePlugin } from "platejs/react";

import { useFixedToolbar } from "../../hooks/use-host-slots";
import { FloatingToolbar } from "../../ui/floating-toolbar";
import { FloatingToolbarButtons } from "../../ui/floating-toolbar-buttons";

function SelectionToolbar() {
  const fixed = useFixedToolbar();
  if (fixed) return null;
  return (
    <FloatingToolbar>
      <FloatingToolbarButtons />
    </FloatingToolbar>
  );
}

export const FloatingToolbarKit = [
  createPlatePlugin({
    key: "floating-toolbar",
    render: {
      afterEditable: () => <SelectionToolbar />,
    },
  }),
];
