import { insertCallout } from "@platejs/callout";
import { insertCodeBlock } from "@platejs/code-block";
import { insertDate } from "@platejs/date";
import { insertColumnGroup, toggleColumnGroup } from "@platejs/layout";
import {
  insertAudioPlaceholder,
  insertFilePlaceholder,
  insertImagePlaceholder,
  insertVideoPlaceholder,
} from "@platejs/media";
import { insertTable } from "@platejs/table";
import { KEYS, type NodeEntry, type Path, PathApi, type TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

const ACTION_THREE_COLUMNS = "action_three_columns";

type InsertAt = { at?: Path };

const insertList = (editor: PlateEditor, type: string, options: InsertAt = {}) => {
  editor.tf.insertNodes(
    editor.api.create.block({
      indent: 1,
      listStyleType: type,
    }),
    { select: true, ...options },
  );
};

const insertBlockMap: Record<
  string,
  (editor: PlateEditor, type: string, options?: InsertAt) => void
> = {
  [KEYS.listTodo]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.ul]: insertList,
  [ACTION_THREE_COLUMNS]: (editor, _type, options) =>
    insertColumnGroup(editor, { columns: 3, select: true, ...options }),
  [KEYS.audio]: (editor, _type, options) =>
    insertAudioPlaceholder(editor, { select: true, ...options }),
  [KEYS.callout]: (editor, _type, options) => insertCallout(editor, { select: true, ...options }),
  [KEYS.codeBlock]: (editor, _type, options) =>
    insertCodeBlock(editor, { select: true, ...options }),
  [KEYS.file]: (editor, _type, options) => insertFilePlaceholder(editor, { select: true, ...options }),
  [KEYS.img]: (editor, _type, options) => insertImagePlaceholder(editor, { select: true, ...options }),
  [KEYS.table]: (editor, _type, options) => insertTable(editor, {}, { select: true, ...options }),
  [KEYS.video]: (editor, _type, options) =>
    insertVideoPlaceholder(editor, { select: true, ...options }),
};

const insertInlineMap: Record<string, (editor: PlateEditor, type: string) => void> = {
  [KEYS.date]: (editor) => insertDate(editor, { select: true }),
};

export const insertBlock = (editor: PlateEditor, type: string) => {
  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();

    if (!block) return;
    if (type in insertBlockMap) {
      insertBlockMap[type](editor, type);
    } else {
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(block[1]),
        select: true,
      });
    }
    if (getBlockType(block[0]) !== type) {
      editor.tf.removeNodes({ previousEmptyBlock: true });
    }
  });
};

export const insertBlockAt = (editor: PlateEditor, type: string, at: Path) => {
  if (type in insertBlockMap) {
    insertBlockMap[type](editor, type, { at });
  } else {
    editor.tf.insertNodes(editor.api.create.block({ type }), { at, select: true });
  }
};

export const insertInlineElement = (editor: PlateEditor, type: string) => {
  if (insertInlineMap[type]) {
    insertInlineMap[type](editor, type);
  }
};

const setList = (editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => {
  editor.tf.setNodes(
    editor.api.create.block({
      indent: 1,
      listStyleType: type,
    }),
    {
      at: entry[1],
    },
  );
};

const setBlockMap: Record<
  string,
  (editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => void
> = {
  [KEYS.listTodo]: setList,
  [KEYS.ol]: setList,
  [KEYS.ul]: setList,
  [ACTION_THREE_COLUMNS]: (editor) => toggleColumnGroup(editor, { columns: 3 }),
};

export const setBlockType = (editor: PlateEditor, type: string, { at }: { at?: Path } = {}) => {
  editor.tf.withoutNormalizing(() => {
    const setEntry = (entry: NodeEntry<TElement>) => {
      const [node, path] = entry;

      if (node[KEYS.listType]) {
        editor.tf.unsetNodes([KEYS.listType, "indent"], { at: path });
      }
      if (type in setBlockMap) {
        return setBlockMap[type](editor, type, entry);
      }
      if (node.type !== type) {
        editor.tf.setNodes<TElement>({ type }, { at: path });
      }
    };

    if (at) {
      const entry = editor.api.node<TElement>(at);

      if (entry) {
        setEntry(entry);

        return;
      }
    }

    const entries = editor.api.blocks({ mode: "lowest" });

    entries.forEach((entry) => {
      setEntry(entry);
    });
  });
};

export const getBlockType = (block: TElement) => {
  if (block[KEYS.listType]) {
    if (block[KEYS.listType] === KEYS.ol) {
      return KEYS.ol;
    }
    if (block[KEYS.listType] === KEYS.listTodo) {
      return KEYS.listTodo;
    }
    return KEYS.ul;
  }

  return block.type;
};
