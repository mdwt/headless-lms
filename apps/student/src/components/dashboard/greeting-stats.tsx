interface Stat {
  value: string;
  label: string;
}

/** Greeting + stat chips row (handoff §2). */
export function GreetingStats({
  eyebrow,
  heading,
  stats,
}: {
  eyebrow: string;
  heading: string;
  stats: Stat[];
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
      <div>
        <div
          suppressHydrationWarning
          className="mb-[7px] text-[12px] tracking-[0.04em] text-ink-4"
        >
          {eyebrow}
        </div>
        <h1
          suppressHydrationWarning
          className="text-[33px] font-semibold tracking-[-0.015em]"
        >
          {heading}
        </h1>
      </div>
      <div className="flex gap-2.5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex min-w-[84px] flex-col gap-0.5 rounded-[12px] border border-line bg-surface px-4 py-2.5"
          >
            <span className="text-[19px] font-medium tracking-[-0.01em] text-ink">{s.value}</span>
            <span className="text-[11.5px] tracking-[0.01em] text-ink-3">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
