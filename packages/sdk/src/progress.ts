// Ergonomic usage reporting over the generated Learn client. Frontends report
// what happened; the server decides completion — completed() resolves with the
// server's answer, opened()/position() are fire-and-forget.
import { Learn } from "./generated";

export type ActivityStatus = "in-progress" | "completed";

export interface ProgressReporter {
  /** The student is on the activity — creates the record on first touch. */
  opened(): void;
  /** Player position update (opaque payload, interpreted server-side). */
  position(position: unknown): void;
  /** The learner claims done; resolves with the server's decision (null on transport failure). */
  completed(): Promise<ActivityStatus | null>;
}

export function progressReporter(courseId: string, activityId: string): ProgressReporter {
  const path = { courseId, activityId };
  const send = async (body: {
    position?: unknown;
    completed?: boolean;
  }): Promise<ActivityStatus | null> => {
    try {
      const res = await Learn.reportActivityProgress({ path, body });
      return res.data?.status ?? null;
    } catch {
      return null;
    }
  };
  return {
    opened() {
      void send({});
    },
    position(position: unknown) {
      void send({ position });
    },
    completed() {
      return send({ completed: true });
    },
  };
}
