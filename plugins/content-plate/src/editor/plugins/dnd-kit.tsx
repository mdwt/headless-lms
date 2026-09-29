"use client";

import { DndPlugin } from "@platejs/dnd";
import { PlaceholderPlugin } from "@platejs/media/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { isBlockLibraryDragItem } from "../../ui/block-library";
import { BlockDraggable } from "../../ui/block-draggable";
import { insertBlockAt } from "../transforms";

export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
      onDropFiles: ({ dragItem, editor, target }) => {
        if (isBlockLibraryDragItem(dragItem)) {
          if (target) {
            insertBlockAt(editor, dragItem.blockType, target);
            editor.tf.focus();
          }
          return;
        }
        editor
          .getTransforms(PlaceholderPlugin)
          .insert.media(dragItem.files, { at: target, nextBlock: false });
      },
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
    },
  }),
];
