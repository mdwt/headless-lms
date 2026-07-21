// RSC-safe static renderer — no 'use client', no hooks, no browser APIs.
// PlateStatic renders the stored value on the server, so the public/preview
// route ships no editor JS. See https://platejs.org/docs/static.
import type { Value } from "platejs";
import { createSlateEditor } from "platejs";
import { PlateStatic, SlateElement, type SlateElementProps } from "platejs/static";
import {
  BaseBoldPlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseItalicPlugin,
} from "@platejs/basic-nodes";

import { isNodeList } from "./validate";

function H1ElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      as="h1"
      style={{ fontSize: "1.6em", fontWeight: 700, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

function H2ElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      as="h2"
      style={{ fontSize: "1.3em", fontWeight: 600, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

function H3ElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      as="h3"
      style={{ fontSize: "1.1em", fontWeight: 600, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

export function Renderer({ config }: { config: unknown }) {
  const editor = createSlateEditor({
    plugins: [
      BaseBoldPlugin,
      BaseItalicPlugin,
      BaseH1Plugin.withComponent(H1ElementStatic),
      BaseH2Plugin.withComponent(H2ElementStatic),
      BaseH3Plugin.withComponent(H3ElementStatic),
    ],
    value: isNodeList(config) ? (config as Value) : [],
  });

  return <PlateStatic editor={editor} style={{ fontSize: 15, lineHeight: 1.6 }} />;
}
