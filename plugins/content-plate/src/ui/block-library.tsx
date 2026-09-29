"use client";

import { DndPlugin, DRAG_ITEM_BLOCK } from "@platejs/dnd";
import {
  AudioLinesIcon,
  ChevronDownIcon,
  Code2Icon,
  Columns3Icon,
  FileUpIcon,
  FilmIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SearchIcon,
  SquareCheckIcon,
  TableIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { type PlateEditor, useEditorRef } from "platejs/react";
import { useMemo, useState, type ReactNode } from "react";
import { useDrag } from "react-dnd";

import { insertBlock } from "../editor/transforms";
import { cn } from "../lib/utils";

type LibraryItem = { type: string; label: string; icon: ReactNode; keywords?: string[] };

const GROUPS: { label: string; items: LibraryItem[] }[] = [
  {
    label: "Text",
    items: [
      { type: KEYS.p, label: "Text", icon: <PilcrowIcon />, keywords: ["paragraph"] },
      { type: KEYS.h1, label: "Heading 1", icon: <Heading1Icon />, keywords: ["title"] },
      { type: KEYS.h2, label: "Heading 2", icon: <Heading2Icon />, keywords: ["subtitle"] },
      { type: KEYS.h3, label: "Heading 3", icon: <Heading3Icon />, keywords: ["subtitle"] },
      { type: KEYS.blockquote, label: "Quote", icon: <QuoteIcon />, keywords: ["citation"] },
      { type: KEYS.callout, label: "Callout", icon: <LightbulbIcon />, keywords: ["note"] },
    ],
  },
  {
    label: "Lists",
    items: [
      { type: KEYS.ul, label: "Bulleted list", icon: <ListIcon />, keywords: ["unordered"] },
      { type: KEYS.ol, label: "Numbered list", icon: <ListOrderedIcon />, keywords: ["ordered"] },
      { type: KEYS.listTodo, label: "To-do list", icon: <SquareCheckIcon />, keywords: ["task"] },
      { type: KEYS.toggle, label: "Toggle", icon: <ChevronDownIcon />, keywords: ["collapsible"] },
    ],
  },
  {
    label: "Media",
    items: [
      { type: KEYS.img, label: "Image", icon: <ImageIcon />, keywords: ["photo", "picture"] },
      { type: KEYS.video, label: "Video", icon: <FilmIcon />, keywords: ["movie"] },
      { type: KEYS.audio, label: "Audio", icon: <AudioLinesIcon />, keywords: ["sound"] },
      { type: KEYS.file, label: "File", icon: <FileUpIcon />, keywords: ["attachment", "pdf"] },
    ],
  },
  {
    label: "Layout",
    items: [
      { type: KEYS.table, label: "Table", icon: <TableIcon /> },
      { type: "action_three_columns", label: "Columns", icon: <Columns3Icon /> },
      { type: KEYS.codeBlock, label: "Code", icon: <Code2Icon />, keywords: ["snippet"] },
    ],
  },
];

export function isBlockLibraryDragItem(item: unknown): item is { blockType: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { blockType?: unknown }).blockType === "string"
  );
}

function insertFromLibrary(editor: PlateEditor, type: string) {
  if (!editor.selection) editor.tf.select(editor.api.end([]));
  insertBlock(editor, type);
  editor.tf.focus();
}

export function BlockLibrary() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.keywords?.some((keyword) => keyword.includes(q)),
      ),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3">
        <label className="relative flex items-center">
          <SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <input
            aria-label="Search blocks"
            className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-8 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 sm:h-8 sm:text-sm"
            name="block-search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No blocks match “{query.trim()}”.</p>
        ) : (
          groups.map((group) => (
            <section className="flex flex-col gap-2" key={group.label}>
              <h3 className="font-medium text-muted-foreground text-xs">{group.label}</h3>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((item) => (
                  <LibraryTile item={item} key={item.type} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="shrink-0 border-border border-t px-4 py-3 text-muted-foreground text-sm text-pretty">
        Click a block to add it at the cursor, or drag it onto the page.
      </p>
    </div>
  );
}

function LibraryTile({ item }: { item: LibraryItem }) {
  const editor = useEditorRef();
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: DRAG_ITEM_BLOCK,
      item: () => {
        editor.setOption(DndPlugin, "isDragging", true);
        return { blockType: item.type };
      },
      end: () => editor.setOption(DndPlugin, "isDragging", false),
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [editor, item.type],
  );

  return (
    <button
      className={cn(
        "flex h-18 cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg bg-muted px-1 text-center font-medium text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing [&_svg]:size-4 [&_svg]:shrink-0",
        isDragging && "opacity-50",
      )}
      onClick={() => insertFromLibrary(editor, item.type)}
      ref={(node) => {
        dragRef(node);
      }}
      type="button"
    >
      {item.icon}
      <span className="text-balance">{item.label}</span>
    </button>
  );
}
