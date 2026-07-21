'use client';

import { Bold, Code2, Italic, Strikethrough, Underline } from 'lucide-react';
import { KEYS } from 'platejs';
import {
  useEditorReadOnly,
  useSelectionAcrossBlocks,
} from 'platejs/react';
import * as React from 'react';

import { FontColorToolbarButton } from './font-color-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  const isSelectionAcrossBlocks = useSelectionAcrossBlocks();

  return (
    <div
      className="flex"
      style={{
        transform: 'translateX(calc(-1px))',
        whiteSpace: 'nowrap',
      }}
    >
      {!readOnly && (
        <>
          <ToolbarGroup>
            <TurnIntoToolbarButton />

            <MarkToolbarButton
              nodeType={KEYS.bold}
              shortcut="⌘+B"
              tooltip="Bold"
            >
              <Bold />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.italic}
              shortcut="⌘+I"
              tooltip="Italic"
            >
              <Italic />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              shortcut="⌘+U"
              tooltip="Underline"
            >
              <Underline />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              shortcut="⌘+Shift+X"
              tooltip="Strikethrough"
            >
              <Strikethrough />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.code}
              shortcut="⌘+E"
              tooltip="Code"
            >
              <Code2 />
            </MarkToolbarButton>

            <LinkToolbarButton />

            <FontColorToolbarButton />
          </ToolbarGroup>
          <ToolbarGroup>
            {!isSelectionAcrossBlocks && <MoreToolbarButton />}
          </ToolbarGroup>
        </>
      )}
    </div>
  );
}
