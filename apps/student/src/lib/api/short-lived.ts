/**
 * Keeps an answer per key for a short while, so many requests for the same key
 * share one load. A failed load is not kept; while a key's last answer is still
 * held, a failed reload returns that answer instead.
 */
export function shortLived<T>(options: { ttlMs: number; max: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const answers = new Map<string, { value: T; freshUntil: number }>();
  const loading = new Map<string, Promise<T>>();

  return (key: string, load: () => Promise<T>): Promise<T> => {
    const held = answers.get(key);
    if (held && held.freshUntil > now()) {
      return Promise.resolve(held.value);
    }
    const running = loading.get(key);
    if (running) {
      return running;
    }
    const started = load()
      .then(
        (value) => {
          if (!answers.has(key) && answers.size >= options.max) {
            answers.clear();
          }
          answers.set(key, { value, freshUntil: now() + options.ttlMs });
          return value;
        },
        (error: unknown) => {
          if (held) {
            return held.value;
          }
          throw error;
        },
      )
      .finally(() => loading.delete(key));
    loading.set(key, started);
    return started;
  };
}
