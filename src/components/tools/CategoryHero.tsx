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
        "relative overflow-hidden rounded-[2rem] border border-zinc-800/80 bg-[radial-gradient(ellipse_at_top_left,rgba(91,92,255,0.22),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(46,230,166,0.10),transparent_35%),#060709] p-8 shadow-lg sm:p-12",
        className,
      )}
    >
      {/* Subtle shimmer overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.025)_40%,transparent_70%)]" aria-hidden />
      {/* Top edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" aria-hidden />

      <div className="relative z-10 flex flex-col gap-8">
        <div className="max-w-2xl space-y-4">
          <p className="font-manrope text-xs font-semibold uppercase tracking-[0.24em] text-primary/90">{eyebrow}</p>
          <h1 className="font-manrope text-4xl font-bold tracking-tight text-white sm:text-5xl">{title}</h1>
          <p className="max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">{description}</p>
        </div>

        {stats.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-800/70 to-zinc-900/60 px-5 py-5 shadow-sm ring-1 ring-white/[0.04]"
              >
                <div className="font-manrope text-3xl font-bold tracking-tight text-white">{stat.value}</div>
                <div className="mt-1.5 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">{stat.label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {children}
      </div>
    </section>
  );
}
