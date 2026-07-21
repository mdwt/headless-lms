import type { TCodeBlockElement } from 'platejs';
import {
  SlateElement,
  type SlateElementProps,
  SlateLeaf,
  type SlateLeafProps,
} from 'platejs/static';
import * as React from 'react';

import { cn } from '../lib/utils';

export function CodeBlockElementStatic(
  props: SlateElementProps<TCodeBlockElement>
) {
  return (
    <SlateElement
      className={cn(
        'py-1',
        '**:[.hljs-comment,.hljs-code,.hljs-formula]:text-[#6a737d]',
        '**:[.hljs-keyword,.hljs-doctag,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_]:text-[#d73a49]',
        '**:[.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_]:text-[#6f42c1]',
        '**:[.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable]:text-[#005cc5]',
        '**:[.hljs-regexp,.hljs-string,.hljs-meta_.hljs-string]:text-[#032f62]',
        '**:[.hljs-built_in,.hljs-symbol]:text-[#e36209]',
        '**:[.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo]:text-[#22863a]',
        '**:[.hljs-emphasis]:italic',
        '**:[.hljs-strong]:font-bold',
        '**:[.hljs-section]:font-bold **:[.hljs-section]:text-[#005cc5]',
        '**:[.hljs-bullet]:text-[#735c0f]',
        '**:[.hljs-addition]:bg-[#f0fff4] **:[.hljs-addition]:text-[#22863a]',
        '**:[.hljs-deletion]:bg-[#ffeef0] **:[.hljs-deletion]:text-[#b31d28]'
      )}
      {...props}
    >
      <pre className="overflow-x-auto rounded-md bg-muted pt-[34px] pr-4 pb-8 pl-8 font-mono text-sm leading-[normal] [tab-size:2] print:break-inside-avoid">
        <code>{props.children}</code>
      </pre>
    </SlateElement>
  );
}

export function CodeLineElementStatic(props: SlateElementProps) {
  return <SlateElement {...props} />;
}

export function CodeSyntaxLeafStatic(props: SlateLeafProps) {
  const tokenClassName = props.leaf.className as string;

  return <SlateLeaf {...props} className={tokenClassName} />;
}

/**
 * DOCX-compatible code block components.
 * Uses inline styles for proper rendering in Word documents.
 */

export function CodeBlockElementDocx(
  props: SlateElementProps<TCodeBlockElement>
) {
  return (
    <SlateElement {...props}>
      <div
        style={{
          backgroundColor: '#f5f5f5',
          border: '1px solid #e0e0e0',
          margin: '8pt 0',
          padding: '12pt',
        }}
      >
        {props.children}
      </div>
    </SlateElement>
  );
}

export function CodeLineElementDocx(props: SlateElementProps) {
  return (
    <SlateElement
      {...props}
      as="p"
      style={{
        fontFamily: "'Courier New', Consolas, monospace",
        fontSize: '10pt',
        margin: 0,
        padding: 0,
      }}
    />
  );
}

// Syntax highlighting color map for common token types
const syntaxColors: Record<string, string> = {
  'hljs-addition': '#22863a',
  'hljs-attr': '#005cc5',
  'hljs-attribute': '#005cc5',
  'hljs-built_in': '#e36209',
  'hljs-bullet': '#735c0f',
  'hljs-comment': '#6a737d',
  'hljs-deletion': '#b31d28',
  'hljs-doctag': '#d73a49',
  'hljs-emphasis': '#24292e',
  'hljs-formula': '#6a737d',
  'hljs-keyword': '#d73a49',
  'hljs-literal': '#005cc5',
  'hljs-meta': '#005cc5',
  'hljs-name': '#22863a',
  'hljs-number': '#005cc5',
  'hljs-operator': '#005cc5',
  'hljs-quote': '#22863a',
  'hljs-regexp': '#032f62',
  'hljs-section': '#005cc5',
  'hljs-selector-attr': '#005cc5',
  'hljs-selector-class': '#005cc5',
  'hljs-selector-id': '#005cc5',
  'hljs-selector-pseudo': '#22863a',
  'hljs-selector-tag': '#22863a',
  'hljs-string': '#032f62',
  'hljs-strong': '#24292e',
  'hljs-symbol': '#e36209',
  'hljs-template-tag': '#d73a49',
  'hljs-template-variable': '#d73a49',
  'hljs-title': '#6f42c1',
  'hljs-type': '#d73a49',
  'hljs-variable': '#005cc5',
};

// Convert regular spaces to non-breaking spaces to preserve indentation in Word
const preserveSpaces = (text: string): string => {
  // Replace regular spaces with non-breaking spaces
  return text.replace(/ /g, '\u00A0');
};

export function CodeSyntaxLeafDocx(props: SlateLeafProps) {
  const tokenClassName = props.leaf.className as string;

  // Extract color from className
  let color: string | undefined;
  let fontWeight: string | undefined;
  let fontStyle: string | undefined;

  if (tokenClassName) {
    const classes = tokenClassName.split(' ');
    for (const cls of classes) {
      if (syntaxColors[cls]) {
        color = syntaxColors[cls];
      }
      if (cls === 'hljs-strong' || cls === 'hljs-section') {
        fontWeight = 'bold';
      }
      if (cls === 'hljs-emphasis') {
        fontStyle = 'italic';
      }
    }
  }

  // Get the text content and preserve spaces
  const text = props.leaf.text as string;
  const preservedText = preserveSpaces(text);

  return (
    <span
      data-slate-leaf="true"
      style={{
        color,
        fontFamily: "'Courier New', Consolas, monospace",
        fontSize: '10pt',
        fontStyle,
        fontWeight,
      }}
    >
      {preservedText}
    </span>
  );
}
