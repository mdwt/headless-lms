// The generated SDK returns a `{ data, error, response }` result (its
// `RequestResult` shape) but doesn't re-export the type from the package root,
// so the shape is declared inline here.
export interface SdkResult<T> {
  data?: T;
  error?: unknown;
  response?: { status: number };
}

export function unwrap<T>(result: SdkResult<T>): T {
  if (result.error) throw new Error(`API error: ${result.response?.status ?? "unknown"}`);
  return result.data as T;
}
