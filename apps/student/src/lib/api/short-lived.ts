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
          answers.delete(key);
          if (answers.size >= options.max) {
            const oldest = answers.keys().next();
            if (!oldest.done) {
              answers.delete(oldest.value);
            }
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
