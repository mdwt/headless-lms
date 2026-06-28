"use client";

import { Check, X } from "lucide-react";

import type { QuizQuestion } from "@/lib/types";
import type { QuizState } from "../course-player";

/** Quiz / checkpoint renderer (handoff §10). */
export function QuizLesson({
  questions,
  quiz,
  onSelect,
  onSubmit,
  onReset,
}: {
  questions: QuizQuestion[];
  quiz: QuizState;
  onSelect: (qi: number, oi: number) => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  const { answers, submitted } = quiz;
  const answeredCount = Object.keys(answers).length;
  const score = questions.reduce((n, q, i) => {
    const picked = answers[i];
    return n + (picked !== undefined && q.options[picked]?.id === q.correctOptionId ? 1 : 0);
  }, 0);
  const passed = score === questions.length;
  const canSubmit = answeredCount >= questions.length;

  return (
    <div className="rounded-card border border-line bg-surface px-[30px] py-7">
      {questions.map((q, qi) => (
        <div key={q.id} className="mb-[26px]">
          <div className="mb-3.5 flex gap-3">
            <span className="flex-none pt-0.5 text-[12px] text-brand">Q{qi + 1}</span>
            <div className="text-[18px] font-semibold leading-[1.35]">{q.prompt}</div>
          </div>
          <div className="flex flex-col gap-[9px] pl-6">
            {q.options.map((opt, oi) => {
              const picked = answers[qi] === oi;
              const isCorrect = submitted && opt.id === q.correctOptionId;
              const isWrong = submitted && picked && opt.id !== q.correctOptionId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={submitted}
                  onClick={() => onSelect(qi, oi)}
                  className="flex w-full items-center gap-3 rounded-[11px] px-[15px] py-[13px] text-left text-[14.5px] transition-[border-color,background] duration-150"
                  style={optionStyle(picked, isCorrect, isWrong)}
                >
                  <span
                    className="flex size-5 flex-none items-center justify-center rounded-full text-white"
                    style={markStyle(picked, isCorrect, isWrong, submitted)}
                  >
                    {(picked || isCorrect) &&
                      (isWrong ? (
                        <X className="size-3" strokeWidth={2.6} />
                      ) : (
                        <Check className="size-3" strokeWidth={2.6} />
                      ))}
                  </span>
                  <span className="flex-1">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {submitted ? (
        <>
          <div
            className="rounded-[12px] px-4 py-3.5"
            style={
              passed
                ? { background: "var(--brand-soft)", color: "var(--brand-strong)" }
                : { background: "#f6efe6", color: "#8a6a2e" }
            }
          >
            <div className="mb-0.5 text-[15px] font-bold">
              {passed ? "Perfect — all correct" : `You got ${score} of ${questions.length}`}
            </div>
            <div className="text-[13.5px] opacity-85">
              {passed
                ? "This checkpoint is marked complete."
                : "Review the highlighted answers and try again."}
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="mt-4 rounded-full border border-line-btn bg-surface px-5 py-2.5 text-[13.5px] font-semibold"
            style={{ color: "#4a4843" }}
          >
            Try again
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          className="mt-1.5 rounded-full bg-brand px-[26px] py-3 text-[14.5px] font-semibold text-white"
          style={{ opacity: canSubmit ? 1 : 0.45 }}
        >
          Submit answers
        </button>
      )}
    </div>
  );
}

function optionStyle(
  picked: boolean,
  isCorrect: boolean,
  isWrong: boolean,
): React.CSSProperties {
  if (isCorrect)
    return {
      border: "1px solid var(--brand)",
      background: "var(--brand-soft)",
      color: "var(--brand-strong)",
      fontWeight: 600,
    };
  if (isWrong)
    return { border: "1px solid #e6c7c7", background: "#fbf1f1", color: "#a14444" };
  if (picked)
    return {
      border: "1px solid var(--brand)",
      background: "#fff",
      color: "#1b1b19",
      fontWeight: 500,
    };
  return { border: "1px solid #e6e3dc", background: "#fff", color: "#33312c" };
}

function markStyle(
  picked: boolean,
  isCorrect: boolean,
  isWrong: boolean,
  submitted: boolean,
): React.CSSProperties {
  if (isCorrect || (picked && !submitted))
    return { background: "var(--brand)", border: "1.5px solid var(--brand)" };
  if (isWrong) return { background: "#c25b5b", border: "1.5px solid #c25b5b" };
  return { border: "1.5px solid #cfccc3" };
}
