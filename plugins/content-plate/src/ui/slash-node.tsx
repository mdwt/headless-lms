'use client';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import {
  AudioLinesIcon,
  CalendarIcon,
  ChevronDownIcon,
  Code2Icon,
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
  RectangleVerticalIcon,
  SquareIcon,
  TableIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import type { PlateEditor, PlateElementProps } from 'platejs/react';
import { PlateElement } from 'platejs/react';
import * as React from 'react';

import {
  insertBlock,
  insertInlineElement,
  setBlockType,
} from '../editor/transforms';
import { blockMenuItems } from './block-menu';

import {
  backgroundColorItems,
  ColorIcon,
  textColorItems,
} from './font-color-toolbar-button';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';
import { turnIntoItems } from './turn-into-toolbar-button';

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    description?: string;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

const groups: Group[] = [
  {
    group: 'Basic blocks',
    items: [
      {
        description: 'Plain text.',
        icon: <PilcrowIcon />,
        keywords: ['paragraph'],
        label: 'Text',
        value: KEYS.p,
      },
      {
        description: 'Large section heading.',
        icon: <Heading1Icon />,
        keywords: ['title', 'h1'],
        label: 'Heading 1',
        value: KEYS.h1,
      },
      {
        description: 'Medium section heading.',
        icon: <Heading2Icon />,
        keywords: ['subtitle', 'h2'],
        label: 'Heading 2',
        value: KEYS.h2,
      },
      {
        description: 'Small section heading.',
        icon: <Heading3Icon />,
        keywords: ['subtitle', 'h3'],
        label: 'Heading 3',
        value: KEYS.h3,
      },
      {
        description: 'Create a bulleted list.',
        icon: <ListIcon />,
        keywords: ['unordered', 'ul', '-'],
        label: 'Bulleted list',
        value: KEYS.ul,
      },
      {
        description: 'Create a numbered list.',
        icon: <ListOrderedIcon />,
        keywords: ['ordered', 'ol', '1'],
        label: 'Numbered list',
        value: KEYS.ol,
      },
      {
        description: 'Insert a checklist for tasks.',
        icon: <SquareIcon />,
        keywords: ['checklist', 'task', 'checkbox', '[]'],
        label: 'To-do list',
        value: KEYS.listTodo,
      },
      {
        description: 'Insert a collapsible section.',
        icon: <ChevronDownIcon />,
        keywords: ['collapsible', 'expandable'],
        label: 'Toggle',
        value: KEYS.toggle,
      },
      {
        description: 'Insert a block for code.',
        icon: <Code2Icon />,
        keywords: ['```'],
        label: 'Code Block',
        value: KEYS.codeBlock,
      },
      {
        description: 'Create a table for data.',
        icon: <TableIcon />,
        label: 'Table',
        value: KEYS.table,
      },
      {
        description: 'Insert a quote for emphasis.',
        icon: <QuoteIcon />,
        keywords: ['citation', 'blockquote', 'quote', '>'],
        label: 'Blockquote',
        value: KEYS.blockquote,
      },
      {
        description: 'Insert a highlighted block.',
        icon: <LightbulbIcon />,
        keywords: ['note'],
        label: 'Callout',
        value: KEYS.callout,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Media',
    items: [
      {
        description: 'Upload or embed an image.',
        icon: <ImageIcon />,
        keywords: ['media', 'img', 'picture', 'photo'],
        label: 'Image',
        value: KEYS.img,
      },
      {
        description: 'Upload or embed a video.',
        icon: <FilmIcon />,
        keywords: ['media', 'video', 'movie'],
        label: 'Video',
        value: KEYS.video,
      },
      {
        description: 'Upload or embed audio.',
        icon: <AudioLinesIcon />,
        keywords: ['media', 'audio', 'sound'],
        label: 'Audio',
        value: KEYS.audio,
      },
      {
        description: 'Upload or link any file type.',
        icon: <FileUpIcon />,
        keywords: ['media', 'file', 'document', 'attachment'],
        label: 'File',
        value: KEYS.file,
      },
    ].map((item) => ({
      ...item,
      focusEditor: false,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Advanced blocks',
    items: [
      {
        description: 'Create 3 columns of blocks.',
        icon: <RectangleVerticalIcon />,
        label: '3 columns',
        value: 'action_three_columns',
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Inline',
    items: [
      {
        description: 'Insert current or custom date.',
        focusEditor: true,
        icon: <CalendarIcon />,
        keywords: ['time'],
        label: 'Date',
        value: KEYS.date,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertInlineElement(editor, value);
      },
    })),
  },
  {
    group: 'Turn into',
    items: turnIntoItems.map((item) => ({
      ...item,
      onSelect: (editor) => {
        setBlockType(editor, item.value);
      },
    })),
  },
  {
    group: 'Actions',
    items: [
      {
        ...blockMenuItems.delete,
        onSelect: (editor) => {
          editor.tf.removeNodes();
        },
      },
      {
        ...blockMenuItems.duplicate,
        onSelect: (editor) => {
          editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
        },
      },
    ],
  },
  {
    group: 'Text color',
    items: textColorItems.map((item) => ({
      ...item,
      icon: <ColorIcon group="color" value={item.value} />,
      onSelect: (editor) => {
        editor.tf.setNodes(
          { color: item.value },
          { at: editor.api.block()![1], mode: 'lowest' }
        );
      },
    })),
  },
  {
    group: 'Background color',
    items: backgroundColorItems.map((item) => ({
      ...item,
      icon: <ColorIcon group="background" value={item.value} />,
      onSelect: (editor) => {
        editor.tf.setNodes(
          { backgroundColor: item.value },
          { at: editor.api.block()![1] }
        );
      },
    })),
  },
];

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map(
                ({
                  description,
                  focusEditor,
                  icon,
                  keywords,
                  label,
                  value,
                  onSelect,
                }) => (
                  <InlineComboboxItem
                    focusEditor={focusEditor}
                    group={group}
                    key={value}
                    keywords={keywords}
                    label={label}
                    onClick={() => onSelect(editor, value)}
                    value={value}
                  >
                    {description ? (
                      <>
                        <div className="flex size-11 items-center justify-center rounded border border-foreground/15 bg-white [&_svg]:size-5 [&_svg]:text-subtle-foreground">
                          {icon}
                        </div>
                        <div className="ml-3 flex flex-1 flex-col truncate">
                          <span>{label ?? value}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {description}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mr-2 text-subtle-foreground">
                          {icon}
                        </div>
                        {label ?? value}
                      </>
                    )}
                  </InlineComboboxItem>
                )
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
