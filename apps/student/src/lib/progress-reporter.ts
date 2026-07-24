// Ergonomic usage reporting over the generated SDK. The app reports facts;
// the server decides completion — completed() resolves with the server's
// answer, opened()/report() never throw.
import { Learn } from "@headless-lms/sdk";

export type ProgressTargetRef = { activity: string };

export type ProgressStatusValue = "in-progress" | "completed";

/** One reported fact: `asset` names the subject within the target (absent =
 *  the target itself), `completed` is the learner's claim; every other field
 *  is the asset type's own vocabulary, passed through opaquely. */
export interface ProgressReportItem {
  asset?: string;
  completed?: boolean;
  [key: string]: unknown;
}

export interface ProgressReporter {
  /** The student is on the target — creates the record on first touch. */
  opened(): void;
  /** Send a batch of report items; resolves with the target's status. */
  report(items: ProgressReportItem[]): Promise<ProgressStatusValue | null>;
  /** The learner claims done; resolves with the server's decision (null on transport failure). */
  completed(): Promise<ProgressStatusValue | null>;
}

export function progressReporter(target: ProgressTargetRef): ProgressReporter {
  const send = async (items: ProgressReportItem[]): Promise<ProgressStatusValue | null> => {
    try {
      const res = await Learn.reportProgress({
        body: { activity: target.activity, reports: items },
      });
      return res.data?.status ?? null;
    } catch {
      return null;
    }
  };
  return {
    opened() {
      void send([]);
    },
    report(items: ProgressReportItem[]) {
      return send(items);
    },
    completed() {
      return send([{ completed: true }]);
    },
  };
}
