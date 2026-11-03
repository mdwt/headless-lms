import type { ApiError } from "@/lib/api/http";

export type ListProblem = { path: string; message: string };
export type ListRefusal = { problems: ListProblem[] };

const AT_CATEGORY = /^categories\[(\d+)\]\.?(.*)$/;

export function listRefusal(err: unknown): ListRefusal | null {
  const { status, issues, message } = (err ?? {}) as Partial<ApiError>;
  if ((status !== 400 && status !== 422) || !(err instanceof Error)) return null;
  if (!issues || issues.length === 0) {
    return { problems: [{ path: "", message: message ?? err.message }] };
  }
  return {
    problems: issues.map((issue) => {
      const path = issue.path.replace(/^body\.?/, "");
      const field = AT_CATEGORY.exec(path)?.[2];
      return {
        path,
        message: status === 400 && field ? `${field} ${issue.message}` : issue.message,
      };
    }),
  };
}

export function problemsByCategory(problems: ListProblem[]): {
  general: string[];
  byIndex: Map<number, string[]>;
} {
  const general: string[] = [];
  const byIndex = new Map<number, string[]>();
  for (const problem of problems) {
    const match = AT_CATEGORY.exec(problem.path);
    if (!match) {
      general.push(problem.path ? `${problem.path}: ${problem.message}` : problem.message);
      continue;
    }
    const index = Number(match[1]);
    byIndex.set(index, [...(byIndex.get(index) ?? []), problem.message]);
  }
  return { general, byIndex };
}
