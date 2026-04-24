import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Stat = {
  label: string;
  value: string;
};

export function CategoryHero({
  eyebrow,
  title,
  description,
  stats = [],
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats?: Stat[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.20),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(46,230,166,0.12),transparent_28%),#060709] p-6 shadow-sm sm:p-10",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.02)_35%,transparent_70%)]" aria-hidden />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="max-w-3xl space-y-3">
          <p className="font-clash text-xs font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
          <h1 className="font-clash text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">{description}</p>
        </div>

        {stats.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 shadow-sm">
                <div className="text-2xl font-semibold tracking-tight text-zinc-100">{stat.value}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">{stat.label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {children}
      </div>
    </section>
  );
}
