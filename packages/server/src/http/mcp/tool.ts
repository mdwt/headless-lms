import { z } from 'zod';
import type { AccessScope } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { classifyError } from '../errors.js';
import type { OrgScope } from '../scope.js';

export interface ToolContext {
  container: Container;
  scope: OrgScope;
  requestId: string;
}

export type ToolKind = 'read' | 'write' | 'destructive';

export interface Tool {
  name: string;
  title: string;
  description: string;
  scope: AccessScope;
  kind: ToolKind;
  idempotent: boolean;
  openWorld: boolean;
  input: z.ZodObject;
  output?: z.ZodType;
  call(input: unknown, ctx: ToolContext): unknown;
}

export interface ToolDef<Input extends z.ZodObject> extends Omit<Tool, 'input' | 'call'> {
  input: Input;
  call(input: z.output<Input>, ctx: ToolContext): unknown;
}

export const noInput = z.object({});

export const actor = (scope: OrgScope) => ({ id: scope.orgUserId, role: scope.role });

export function defineTool<Input extends z.ZodObject>(def: ToolDef<Input>): Tool {
  return { ...def, call: (input, ctx) => def.call(input as z.output<Input>, ctx) };
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function toToolResult(data: unknown): ToolResult {
  const plain: unknown = JSON.parse(JSON.stringify(data === undefined ? { ok: true } : data));
  const structuredContent =
    plain !== null && typeof plain === 'object' && !Array.isArray(plain)
      ? (plain as Record<string, unknown>)
      : { result: plain };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function describeFailure(error: unknown, tool: Tool, ctx: ToolContext): string {
  const known = classifyError(error);
  if (known) {
    return known.message;
  }
  ctx.container.logger.error('mcp tool failed', {
    err: error instanceof Error ? error : new Error(String(error)),
    tool: tool.name,
  });
  return `Internal error (request ${ctx.requestId})`;
}

export async function runTool(tool: Tool, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const input = tool.input.safeParse(args);
  if (!input.success) {
    return toolError(`Invalid input: ${z.prettifyError(input.error)}`);
  }
  try {
    const result = await tool.call(input.data, ctx);
    if (result === null || result === false) {
      return toolError('Not found.');
    }
    return toToolResult(tool.output && result !== undefined ? tool.output.parse(result) : result);
  } catch (error) {
    return toolError(describeFailure(error, tool, ctx));
  }
}
