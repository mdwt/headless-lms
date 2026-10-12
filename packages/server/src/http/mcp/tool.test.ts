import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ActionInvocationError } from '@headless-lms/core/integrations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { classifyError } from '../errors.js';
import { fakeContainer, toolContext } from './test-support.js';
import { defineTool, runTool } from './tool.js';

function tool(call: (input: { id: string }) => unknown) {
  return defineTool({
    name: 'probe',
    title: 'Probe',
    description: 'Probe',
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: z.object({ id: z.string() }),
    call: (input) => call(input),
  });
}

const ctx = () => toolContext(fakeContainer());

describe('runTool', () => {
  it('passes the parsed input to the call and returns its result', async () => {
    const seen: unknown[] = [];
    const result = await runTool(
      tool((input) => (seen.push(input), { a: 1 })),
      { id: 'x' },
      ctx(),
    );
    expect(seen).toEqual([{ id: 'x' }]);
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"a":1}' }],
      structuredContent: { a: 1 },
    });
  });

  it('wraps a list result', async () => {
    const result = await runTool(
      tool(() => [1, 2]),
      { id: 'x' },
      ctx(),
    );
    expect(result.structuredContent).toEqual({ result: [1, 2] });
  });

  it('answers ok when the call returns nothing', async () => {
    const result = await runTool(
      tool(() => undefined),
      { id: 'x' },
      ctx(),
    );
    expect(result.structuredContent).toEqual({ ok: true });
  });

  it('answers not found when the call returns null or false', async () => {
    for (const value of [null, false]) {
      const result = await runTool(
        tool(() => value),
        { id: 'x' },
        ctx(),
      );
      expect(result).toEqual({ content: [{ type: 'text', text: 'Not found.' }], isError: true });
    }
  });

  it('reports invalid input without calling', async () => {
    const call = vi.fn();
    const result = await runTool(tool(call), {}, ctx());
    expect(call).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^Invalid input: /);
  });

  it('classifies service errors the way REST does', async () => {
    const error = new NotFoundError('Course', 'crs_1');
    const result = await runTool(
      tool(() => Promise.reject(error)),
      { id: 'x' },
      ctx(),
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: classifyError(error)?.message }],
      isError: true,
    });
  });

  it('reports classified server-side errors with their message and does not log', async () => {
    const container = fakeContainer();
    const logged = vi.spyOn(container.logger, 'error');
    const error = new ActionInvocationError('int_1', 'act_1', new Error('boom'));
    expect(classifyError(error)?.status).toBe(502);
    const result = await runTool(
      tool(() => Promise.reject(error)),
      { id: 'x' },
      toolContext(container),
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: classifyError(error)?.message }],
      isError: true,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('hides internal errors behind the request id and logs them', async () => {
    const container = fakeContainer();
    const logged = vi.spyOn(container.logger, 'error');
    const result = await runTool(
      tool(() => Promise.reject(new Error('db down'))),
      { id: 'x' },
      toolContext(container),
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Internal error (request req_test)' }],
      isError: true,
    });
    expect(logged).toHaveBeenCalledWith(
      'mcp tool failed',
      expect.objectContaining({ tool: 'probe' }),
    );
  });
});
