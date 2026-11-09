"use client";

import type { KEYS, TBasicMarks, TFontMarks, TLinkElement, TText } from "platejs";

export interface MyLinkElement extends TLinkElement {
  id: string;
  children: RichText[];
  type: typeof KEYS.link;
  icon?: string;
  title?: string;
}

export interface RichText extends TBasicMarks, TFontMarks, TText {}
