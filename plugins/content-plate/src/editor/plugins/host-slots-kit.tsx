"use client";

import { createPlatePlugin } from "platejs/react";
import { createPortal } from "react-dom";

import { useHostSlots } from "../../hooks/use-host-slots";
import { BlockLibrary } from "../../ui/block-library";
import { FixedToolbar } from "../../ui/fixed-toolbar";

function HostSlots() {
  const { toolbar, blocks } = useHostSlots();
  return (
    <>
      {toolbar ? createPortal(<FixedToolbar />, toolbar) : null}
      {blocks ? createPortal(<BlockLibrary />, blocks) : null}
    </>
  );
}

export const HostSlotsKit = [
  createPlatePlugin({
    key: "host-slots",
    render: {
      afterEditable: () => <HostSlots />,
    },
  }),
];
