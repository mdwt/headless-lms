import type { ApiError } from "@/lib/api/http";

export type ListRefusal = { problems: string[] };

const FIELD = /^body\.(categories\[\d+\])\.?(.*)$/;
const AT_CATEGORY = /^categories\[(\d+)\][^:]*: (.+)$/;

export function listRefusal(err: unknown): ListRefusal | null {
  const { status, issues, message } = (err ?? {}) as Partial<ApiError>;
  if ((status !== 400 && status !== 422) || !(err instanceof Error)) return null;
  if (!issues || issues.length === 0) return { problems: [message ?? err.message] };
  return {
    problems: issues.map((issue) => {
      if (status === 422) return issue.message;
      const field = FIELD.exec(issue.path);
      if (!field) return `${issue.path.replace(/^body\.?/, "") || "list"}: ${issue.message}`;
      return `${field[1]}: ${field[2] ? `${field[2]} ` : ""}${issue.message}`;
    }),
  };
}

export function problemsByCategory(problems: string[]): {
  general: string[];
  byIndex: Map<number, string[]>;
} {
  const general: string[] = [];
  const byIndex = new Map<number, string[]>();
  for (const problem of problems) {
    const match = AT_CATEGORY.exec(problem);
    if (!match) {
      general.push(problem);
      continue;
    }
    const index = Number(match[1]);
    byIndex.set(index, [...(byIndex.get(index) ?? []), match[2]!]);
  }
  return { general, byIndex };
}
