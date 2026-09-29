"use client";

import {
  useIndentTodoToolBarButton,
  useIndentTodoToolBarButtonState,
  useListToolbarButton,
  useListToolbarButtonState,
} from "@platejs/list/react";
import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  Redo2Icon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";
import { KEYS, type TElement } from "platejs";
import {
  ElementProvider,
  useEditorReadOnly,
  useEditorRef,
  useEditorSelector,
} from "platejs/react";
import type { ComponentProps } from "react";

import { FontColorToolbarButton } from "./font-color-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { MediaToolbarButtons } from "./media-toolbar";
import { Toolbar, ToolbarButton, ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

const MEDIA_LABELS: Record<string, string> = {
  [KEYS.img]: "Image",
  [KEYS.video]: "Video",
  [KEYS.audio]: "Audio",
  [KEYS.file]: "File",
  [KEYS.mediaEmbed]: "Embed",
};

export function FixedToolbar() {
  const readOnly = useEditorReadOnly();
  const media = useEditorSelector((editor) => {
    const block = editor.api.block()?.[0];
    return block && block.type in MEDIA_LABELS ? block : null;
  }, []);

  if (readOnly) return null;

  return (
    <Toolbar
      aria-label={media ? `${MEDIA_LABELS[media.type]} options` : "Formatting"}
      className="scrollbar-hide gap-0 overflow-x-auto bg-transparent"
    >
      {media ? <MediaTools element={media} /> : <TextTools />}
    </Toolbar>
  );
}

function MediaTools({ element }: { element: TElement }) {
  const editor = useEditorRef();
  const path = editor.api.findPath(element);
  if (!path) return null;

  return (
    <ElementProvider element={element} entry={[element, path]} path={path} scope={element.type}>
      <ToolbarGroup>
        <span className="flex h-7 items-center px-1.5 font-medium text-foreground text-sm">
          {MEDIA_LABELS[element.type]}
        </span>
      </ToolbarGroup>
      <ToolbarGroup>
        <MediaToolbarButtons variant="default" />
      </ToolbarGroup>
    </ElementProvider>
  );
}

function TextTools() {
  const editor = useEditorRef();
  const canUndo = useEditorSelector((editor) => editor.history.undos.length > 0, []);
  const canRedo = useEditorSelector((editor) => editor.history.redos.length > 0, []);

  return (
    <>
      <ToolbarGroup>
        <ToolbarButton
          disabled={!canUndo}
          onClick={() => {
            editor.undo();
            editor.tf.focus();
          }}
          shortcut="⌘+Z"
          tooltip="Undo"
        >
          <Undo2Icon />
        </ToolbarButton>
        <ToolbarButton
          disabled={!canRedo}
          onClick={() => {
            editor.redo();
            editor.tf.focus();
          }}
          shortcut="⌘+Shift+Z"
          tooltip="Redo"
        >
          <Redo2Icon />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} shortcut="⌘+B" tooltip="Bold">
          <BoldIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.italic} shortcut="⌘+I" tooltip="Italic">
          <ItalicIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.underline} shortcut="⌘+U" tooltip="Underline">
          <UnderlineIcon />
        </MarkToolbarButton>
        <MarkToolbarButton
          nodeType={KEYS.strikethrough}
          shortcut="⌘+Shift+X"
          tooltip="Strikethrough"
        >
          <StrikethroughIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.code} shortcut="⌘+E" tooltip="Code">
          <Code2Icon />
        </MarkToolbarButton>
        <LinkToolbarButton />
        <FontColorToolbarButton />
      </ToolbarGroup>

      <ToolbarGroup>
        <ListToolbarButton nodeType={KEYS.ul} tooltip="Bulleted list">
          <ListIcon />
        </ListToolbarButton>
        <ListToolbarButton nodeType={KEYS.ol} tooltip="Numbered list">
          <ListOrderedIcon />
        </ListToolbarButton>
        <TodoListToolbarButton />
      </ToolbarGroup>
    </>
  );
}

function ListToolbarButton({
  nodeType,
  ...props
}: ComponentProps<typeof ToolbarButton> & { nodeType: string }) {
  const state = useListToolbarButtonState({ nodeType });
  const { props: buttonProps } = useListToolbarButton(state);
  return <ToolbarButton {...props} {...buttonProps} />;
}

function TodoListToolbarButton() {
  const state = useIndentTodoToolBarButtonState({ nodeType: KEYS.listTodo });
  const { props: buttonProps } = useIndentTodoToolBarButton(state);
  return (
    <ToolbarButton {...buttonProps} tooltip="To-do list">
      <ListTodoIcon />
    </ToolbarButton>
  );
}
