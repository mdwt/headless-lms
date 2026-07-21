import type { TColumnElement } from 'platejs';
import { SlateElement, type SlateElementProps } from 'platejs/static';
import * as React from 'react';

export function ColumnElementStatic(props: SlateElementProps<TColumnElement>) {
  const { width } = props.element;

  return (
    <SlateElement
      className="border border-transparent p-1.5"
      style={{ width: width ?? '100%' }}
      {...props}
    />
  );
}

export function ColumnGroupElementStatic(props: SlateElementProps) {
  return (
    <SlateElement className="my-2" {...props}>
      <div className="flex size-full gap-4 rounded">{props.children}</div>
    </SlateElement>
  );
}

/**
 * DOCX-compatible column component using table cell.
 */
export function ColumnElementDocx(props: SlateElementProps<TColumnElement>) {
  const { width } = props.element;

  return (
    <SlateElement
      {...props}
      as="td"
      style={{
        width: width ?? 'auto',
        verticalAlign: 'top',
        padding: '4px 8px',
        border: 'none',
      }}
    >
      {props.children}
    </SlateElement>
  );
}

/**
 * DOCX-compatible column group component using table layout.
 */
export function ColumnGroupElementDocx(props: SlateElementProps) {
  return (
    <SlateElement {...props}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: 'none',
          tableLayout: 'fixed',
        }}
      >
        <tbody>
          <tr>{props.children}</tr>
        </tbody>
      </table>
    </SlateElement>
  );
}
