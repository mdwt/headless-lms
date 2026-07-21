"use client";

import * as React from "react";
import type { Value } from "platejs";
import {
  Plate,
  PlateContent,
  PlateElement,
  usePlateEditor,
  type PlateElementProps,
} from "platejs/react";
import {
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
} from "@platejs/basic-nodes/react";
import type { PageEditorProps } from "@headless-lms/editor-contract";

import { isNodeList } from "./validate";

// The package is host-app-agnostic (no Tailwind pipeline scans it), so all
// styling is inline and inherits the host's fonts/colors.

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];

function H1Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      style={{ fontSize: "1.6em", fontWeight: 700, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

function H2Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h2"
      style={{ fontSize: "1.3em", fontWeight: 600, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

function H3Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h3"
      style={{ fontSize: "1.1em", fontWeight: 600, margin: "0.6em 0 0.3em" }}
      {...props}
    />
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 6,
  background: "transparent",
  color: "inherit",
  padding: "4px 10px",
  fontSize: 13,
  cursor: "pointer",
};

export function Editor({ initialConfig, onSave }: PageEditorProps) {
  const [saving, setSaving] = React.useState(false);

  const editor = usePlateEditor({
    plugins: [
      BoldPlugin,
      ItalicPlugin,
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
    ],
    value: isNodeList(initialConfig) ? (initialConfig as Value) : EMPTY_VALUE,
  });

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(editor.children);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Plate editor={editor}>
        <div style={{ display: "flex", gap: 6 }} role="toolbar" aria-label="Formatting">
          <button
            type="button"
            style={{ ...buttonStyle, fontWeight: 700 }}
            title="Bold (Ctrl+B)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.tf.toggleMark("bold")}
          >
            B
          </button>
          <button
            type="button"
            style={{ ...buttonStyle, fontStyle: "italic" }}
            title="Italic (Ctrl+I)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.tf.toggleMark("italic")}
          >
            I
          </button>
          {(["h1", "h2", "h3"] as const).map((heading) => (
            <button
              key={heading}
              type="button"
              style={buttonStyle}
              title={`Heading ${heading.slice(1)}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.tf[heading]?.toggle()}
            >
              {heading.toUpperCase()}
            </button>
          ))}
        </div>
        <PlateContent
          placeholder="Start writing…"
          style={{
            minHeight: 320,
            padding: "14px 18px",
            borderRadius: 8,
            border: "1px solid rgba(128,128,128,0.35)",
            outline: "none",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        />
      </Plate>
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            ...buttonStyle,
            padding: "6px 16px",
            fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
