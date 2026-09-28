"use client";

import { Link } from "lucide-react";
import { useEditorPlugin } from "platejs/react";
import type { ComponentProps } from "react";

import { linkPlugin } from "../editor/plugins/link-kit";

import { ToolbarButton } from "./toolbar";

export function LinkToolbarButton(props: ComponentProps<typeof ToolbarButton>) {
  const { api } = useEditorPlugin(linkPlugin);

  return (
    <ToolbarButton data-plate-focus onClick={() => api.a.show()} tooltip="Link" {...props}>
      <Link />
    </ToolbarButton>
  );
}
