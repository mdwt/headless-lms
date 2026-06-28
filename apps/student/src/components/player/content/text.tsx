"use client";

import type { LessonContent } from "@/lib/types";

/** Reader / text article (handoff §10). */
export function TextLesson({ content }: { content: LessonContent }) {
  const body = content.body ?? [];
  const tail = content.tail ?? [];

  return (
    <article>
      {content.lede && (
        <p
          className="mb-[22px] text-[20px] font-normal leading-[1.6]"
          style={{ color: "#33312c" }}
        >
          {content.lede}
        </p>
      )}
      {body.map((p, i) => (
        <p
          key={`b-${i}`}
          className="mb-5 text-[18px] leading-[1.72]"
          style={{ color: "#3a382f" }}
        >
          {p}
        </p>
      ))}
      {content.pullQuote && (
        <blockquote
          className="my-[30px] py-1 pl-6 text-[21px] leading-[1.5]"
          style={{ borderLeft: "3px solid var(--brand)", color: "#2a2823" }}
        >
          {content.pullQuote}
        </blockquote>
      )}
      {tail.map((p, i) => (
        <p
          key={`t-${i}`}
          className="mb-5 text-[18px] leading-[1.72]"
          style={{ color: "#3a382f" }}
        >
          {p}
        </p>
      ))}
    </article>
  );
}
