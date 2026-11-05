import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

const PROBE = [
  'declare const member: { role: string; roleKey: string };',
  'declare const role: string;',
  "export const a = member.role === 'admin';",
  "export const b = 'owner' !== role;",
  "export const c = member.roleKey == 'moderator';",
  'export const d = role === String(member.roleKey);',
  'export function e() { switch (member.role) { default: return 1; } }',
  'export function F() { return <div role="button" aria-label="x" />; }',
  "export const g = <span role={'status'} />;",
].join('\n');

const FLAGGED = [3, 4, 5, 7];

interface LintMessage {
  line: number;
  ruleId: string | null;
}

async function lint(dir: string, file: string): Promise<number[]> {
  const base = `${root}${dir}`;
  const require = createRequire(`${base}package.json`);
  const { ESLint } = (await import(pathToFileURL(require.resolve('eslint')).href)) as {
    ESLint: new (options: { cwd: string }) => {
      lintText(code: string, options: { filePath: string }): Promise<{ messages: LintMessage[] }[]>;
    };
  };
  const [result] = await new ESLint({ cwd: base }).lintText(PROBE, {
    filePath: `${base}${file}`,
  });
  return result!.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.line);
}

describe('the rule against comparing role names', () => {
  it.each([
    ['packages and adapters', '', 'packages/core/src/probe.tsx'],
    ['the admin app', 'apps/admin/', 'src/probe.tsx'],
    ['the student app', 'apps/student/', 'src/probe.tsx'],
  ])(
    'refuses comparisons with a role literal and leaves JSX role attributes alone in %s',
    async (_, dir, file) => {
      expect(await lint(dir, file)).toEqual(FLAGGED);
    },
    60_000,
  );
});
