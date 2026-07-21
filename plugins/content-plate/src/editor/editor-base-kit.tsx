// Server-safe base kit for static rendering (`PlateStatic`) — the
// BaseEditorKit minus the excluded features. No 'use client': this is what the
// RSC Renderer builds its editor from.
import { BaseBasicBlocksKit } from './plugins/basic-blocks-base-kit';
import { BaseBasicMarksKit } from './plugins/basic-marks-base-kit';
import { BaseCalloutKit } from './plugins/callout-base-kit';
import { BaseCodeBlockKit } from './plugins/code-block-base-kit';
import { BaseColumnKit } from './plugins/column-base-kit';
import { BaseDateKit } from './plugins/date-base-kit';
import { BaseFontKit } from './plugins/font-base-kit';
import { BaseLinkKit } from './plugins/link-base-kit';
import { BaseListKit } from './plugins/list-base-kit';
import { BaseMediaKit } from './plugins/media-base-kit';
import { BaseTableKit } from './plugins/table-base-kit';
import { BaseToggleKit } from './plugins/toggle-base-kit';

export const BaseEditorKit = [
  ...BaseBasicBlocksKit,
  ...BaseCodeBlockKit,
  ...BaseTableKit,
  ...BaseToggleKit,
  ...BaseMediaKit,
  ...BaseCalloutKit,
  ...BaseColumnKit,
  ...BaseDateKit,
  ...BaseLinkKit,
  ...BaseBasicMarksKit,
  ...BaseFontKit,
  ...BaseListKit,
];
