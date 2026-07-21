'use client';

import { showCaption } from '@platejs/caption/react';
import {
  BlockMenuPlugin,
  BlockSelectionPlugin,
  useBlockSelectionFragmentProp,
  useBlockSelectionNodes,
} from '@platejs/selection/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CaptionsIcon,
  FilesIcon,
  PaintRoller,
  RefreshCwIcon,
  Trash2,
} from 'lucide-react';
import { KEYS, type TElement } from 'platejs';
import { type PlateEditor, useEditorRef, useHotkeys } from 'platejs/react';
import * as React from 'react';

import {
  getBlockType,
  setBlockType,
} from '../editor/transforms';
import {
  backgroundColorItems,
  ColorIcon,
  textColorItems,
} from './font-color-toolbar-button';
import { turnIntoItems } from './turn-into-toolbar-button';

import { Input } from './input';
import {
  type Action,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
  filterMenuGroups,
  filterMenuItems,
  Menu,
  MenuContent,
  type MenuContentProps,
  MenuGroup,
  MenuItem,
  type MenuProps,
  MenuTrigger,
  useComboboxValueState,
} from './menu';

export function BlockMenu({
  id,
  animateZoom,
  children,
  getAnchorRect,
  open: openProp,
  placement,
  store,
}: Pick<MenuProps, 'open' | 'placement' | 'store'> &
  Pick<MenuContentProps, 'animateZoom' | 'getAnchorRect'> & {
    id?: string;
    children?: React.ReactNode;
  }) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <Menu
      onOpenChange={(open) => {
        setOpen(open);

        if (!open) {
          editor.getApi(BlockMenuPlugin).blockMenu.hide();
        } else if (id) {
          editor.getApi(BlockMenuPlugin).blockMenu.show(id);
        }
      }}
      open={openProp ?? open}
      placement={placement}
      store={store}
      trigger={children ? <MenuTrigger>{children}</MenuTrigger> : undefined}
    >
      <MenuContent
        animateZoom={animateZoom}
        autoFocusOnHide={false}
        getAnchorRect={getAnchorRect}
        portal
        preventBodyScroll={!children}
      >
        <ComboboxContent>
          <BlockMenuInput
            onHide={() => {
              setOpen(false);
              editor.getApi(BlockMenuPlugin).blockMenu.hide();
            }}
          />
        </ComboboxContent>

        <ComboboxList>
          <ComboboxEmpty />

          <BlockMenuItems />
        </ComboboxList>
      </MenuContent>
    </Menu>
  );
}

function BlockMenuInput({ onHide }: { onHide: () => void }) {
  const editor = useEditorRef();
  const blockSelectionTf =
    editor.getTransforms(BlockSelectionPlugin).blockSelection;
  const [value] = useComboboxValueState();

  useHotkeys(
    'backspace',
    (e) => {
      if (value.length === 0) {
        e.preventDefault();
        blockSelectionTf.removeNodes();
        onHide();
      }
    },
    { enableOnFormTags: true }
  );

  useHotkeys(
    'meta+d',
    (e) => {
      if (value.length === 0) {
        e.preventDefault();
        blockSelectionTf.duplicate();
        onHide();
      }
    },
    { enableOnFormTags: true }
  );

  useHotkeys(
    'meta+j',
    () => {
      onHide();
    },
    { enableOnFormTags: true }
  );

  return (
    <ComboboxInput>
      <Input placeholder="Search actions..." />
    </ComboboxInput>
  );
}

const GROUP = {
  ALIGN: 'align',
  BACKGROUND: 'background',
  COLOR: 'color',
  TURN_INTO: 'turn_into',
} as const;

export const blockMenuItems = {
  caption: {
    icon: <CaptionsIcon />,
    keywords: ['alt'],
    label: 'Caption',
    value: 'caption',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      const firstBlock = editor
        .getApi(BlockSelectionPlugin)
        .blockSelection.getNodes()[0];
      showCaption(editor, firstBlock[0] as TElement);
      editor.getApi(BlockSelectionPlugin).blockSelection.clear();
    },
  },
  delete: {
    icon: <Trash2 />,
    keywords: ['remove'],
    label: 'Delete',
    shortcut: 'Del or Ctrl+D',
    value: 'delete',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();
    },
  },
  duplicate: {
    focusEditor: false,
    icon: <FilesIcon />,
    keywords: ['copy'],
    label: 'Duplicate',
    shortcut: '⌘+D',
    value: 'duplicate',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();

      editor.getApi(BlockSelectionPlugin).blockSelection.focus();
    },
  },
  [GROUP.ALIGN]: {
    component: AlignMenuItem,
    filterItems: true,
    icon: <AlignLeft />,
    items: [
      { icon: <AlignLeft />, label: 'Left', value: 'left' },
      { icon: <AlignCenter />, label: 'Center', value: 'center' },
      { icon: <AlignRight />, label: 'Right', value: 'right' },
    ],
    label: 'Align',
    value: GROUP.ALIGN,
  },
  [GROUP.COLOR]: {
    component: ColorMenuItem,
    filterItems: true,
    icon: <PaintRoller />,
    items: [
      { group: GROUP.COLOR, items: textColorItems, label: 'Text color' },
      {
        group: GROUP.BACKGROUND,
        items: backgroundColorItems,
        label: 'Background color',
      },
    ],
    keywords: ['highlight', 'background'],
    label: 'Color',
    value: GROUP.COLOR,
  },
  [GROUP.TURN_INTO]: {
    component: TurnIntoMenuItem,
    filterItems: true,
    icon: <RefreshCwIcon />,
    items: turnIntoItems,
    label: 'Turn into',
    value: GROUP.TURN_INTO,
  },
};

const orderedMenuItems = [
  {
    items: [
      blockMenuItems.delete,
      blockMenuItems.duplicate,
      blockMenuItems[GROUP.TURN_INTO],
    ],
  },
  {
    items: [blockMenuItems[GROUP.COLOR]],
  },
];

const mediaMenuItems = [
  {
    items: [blockMenuItems.caption],
  },
  {
    items: [blockMenuItems[GROUP.ALIGN]],
  },
  {
    items: [blockMenuItems.delete, blockMenuItems.duplicate],
  },
];

function BlockMenuItems() {
  const [searchValue] = useComboboxValueState();
  const selectedBlocks = useBlockSelectionNodes();
  const editor = useEditorRef();

  const menuGroups = React.useMemo(() => {
    const isMedia =
      selectedBlocks.length === 1 &&
      selectedBlocks.some((item) =>
        [KEYS.audio, KEYS.file, KEYS.img, KEYS.mediaEmbed, KEYS.video].includes(
          item[0].type as any
        )
      );

    const items = isMedia ? mediaMenuItems : orderedMenuItems;

    return filterMenuGroups(items, searchValue) || items;
  }, [selectedBlocks, searchValue]);

  return (
    <>
      {menuGroups.map((group, index) => (
        <MenuGroup key={index} label={group.label}>
          {group.items?.map((item: Action) => {
            const menuItem = blockMenuItems[item.value! as keyof typeof blockMenuItems] as (typeof blockMenuItems)[keyof typeof blockMenuItems] & { component?: React.ComponentType; focusEditor?: boolean; onSelect?: (args: { editor: PlateEditor }) => void; shortcut?: string };

            if (menuItem.component) {
              const ItemComponent = menuItem.component;

              return <ItemComponent key={item.value} />;
            }

            return (
              <MenuItem
                icon={menuItem.icon}
                key={item.value}
                label={menuItem.label}
                onClick={() => {
                  menuItem.onSelect?.({ editor });

                  if (menuItem.focusEditor !== false) editor.tf.focus();
                }}
                shortcut={menuItem.shortcut}
              />
            );
          })}
        </MenuGroup>
      ))}
    </>
  );
}

function ColorMenuItem() {
  const [searchValue] = useComboboxValueState();
  const editor = useEditorRef();

  const color = useBlockSelectionFragmentProp({
    key: KEYS.color,
    defaultValue: 'inherit',
    mode: 'text',
  });
  const background = useBlockSelectionFragmentProp({
    key: KEYS.backgroundColor,
    defaultValue: 'transparent',
  });

  const handleColorChange = (group: string, value: string) => {
    if (group === GROUP.COLOR) {
      editor
        .getTransforms(BlockSelectionPlugin)
        .blockSelection.setNodes({ color: value });
    } else if (group === GROUP.BACKGROUND) {
      editor
        .getTransforms(BlockSelectionPlugin)
        .blockSelection.setNodes({ backgroundColor: value });
    }

    editor.getApi(BlockSelectionPlugin).blockSelection.focus();
  };

  const menuGroups = React.useMemo(
    () => filterMenuGroups(blockMenuItems[GROUP.COLOR].items, searchValue),
    [searchValue]
  );

  const content = (
    <>
      {menuGroups.map((menuGroup) => (
        <MenuGroup key={menuGroup.group} label={menuGroup.label}>
          {menuGroup.items?.map((item, index) => (
            <MenuItem
              checked={
                menuGroup.group === GROUP.COLOR
                  ? color === item.value
                  : background === item.value
              }
              icon={<ColorIcon group={menuGroup.group!} value={item.value!} />}
              key={index}
              label={item.label}
              onClick={() => handleColorChange(menuGroup.group!, item.value!)}
            />
          ))}
        </MenuGroup>
      ))}
    </>
  );

  if (searchValue) return content;

  return (
    <Menu
      placement="right"
      trigger={
        <MenuTrigger
          icon={blockMenuItems[GROUP.COLOR].icon}
          label={blockMenuItems[GROUP.COLOR].label}
        />
      }
    >
      <MenuContent portal>{content}</MenuContent>
    </Menu>
  );
}

function AlignMenuItem() {
  const [searchValue] = useComboboxValueState();
  const editor = useEditorRef();
  const value = useBlockSelectionFragmentProp({
    key: 'align',
    defaultValue: 'left',
  });

  const menuItems = React.useMemo(
    () => filterMenuItems(blockMenuItems[GROUP.ALIGN], searchValue),
    [searchValue]
  );

  const content = (
    <>
      {menuItems.map((item) => (
        <MenuItem
          checked={value === item.value}
          icon={item.icon}
          key={item.value}
          label={item.label}
          onClick={() => {
            editor
              .getTransforms(BlockSelectionPlugin)
              .blockSelection.setNodes({ align: item.value });
            editor.tf.focus();
          }}
        />
      ))}
    </>
  );

  if (searchValue)
    return (
      <MenuGroup label={blockMenuItems[GROUP.ALIGN].label}>{content}</MenuGroup>
    );

  return (
    <Menu
      placement="right"
      trigger={
        <MenuTrigger
          icon={blockMenuItems[GROUP.ALIGN].icon}
          label={blockMenuItems[GROUP.ALIGN].label}
        />
      }
    >
      <MenuContent portal>
        <MenuGroup>{content}</MenuGroup>
      </MenuContent>
    </Menu>
  );
}

function TurnIntoMenuItem() {
  const editor = useEditorRef();
  const [searchValue] = useComboboxValueState();

  const value = useBlockSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  const handleTurnInto = (value: string) => {
    editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.getNodes()
      .forEach(([, path]) => {
        setBlockType(editor, value, { at: path });
      });
    editor.getApi(BlockSelectionPlugin).blockSelection.focus();
  };

  const menuItems = React.useMemo(
    () => filterMenuItems(blockMenuItems[GROUP.TURN_INTO], searchValue),
    [searchValue]
  );

  const content = (
    <>
      {menuItems.map((item) => (
        <MenuItem
          checked={value === item.value}
          icon={
            <div className="flex size-5 items-center justify-center rounded-sm border border-foreground/15 bg-white p-0.5 text-subtle-foreground [&_svg]:size-3">
              {item.icon}
            </div>
          }
          key={item.value}
          label={item.label}
          onClick={() => handleTurnInto(item.value!)}
        />
      ))}
    </>
  );

  if (searchValue)
    return (
      <MenuGroup label={blockMenuItems[GROUP.TURN_INTO].label}>
        {content}
      </MenuGroup>
    );

  return (
    <Menu
      placement="right"
      trigger={
        <MenuTrigger
          icon={blockMenuItems[GROUP.TURN_INTO].icon}
          label={blockMenuItems[GROUP.TURN_INTO].label}
        />
      }
    >
      <MenuContent portal>
        <MenuGroup>{content}</MenuGroup>
      </MenuContent>
    </Menu>
  );
}
