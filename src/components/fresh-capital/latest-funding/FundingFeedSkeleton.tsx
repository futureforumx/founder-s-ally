/** Aligns row rhythm with FundingFeedRow desktop / mobile blocks (Fresh Funds grid). */
export function FundingFeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="divide-y divide-zinc-800">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="px-4 py-4 md:px-0 md:py-0">
          <div className="hidden md:block">
            <div className="grid grid-cols-[1.05fr_0.95fr_0.7fr_0.75fr_0.8fr_0.8fr_1.15fr] items-center gap-3 px-4 py-3.5">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="block h-5 w-5 shrink-0 animate-pulse rounded-[3px] bg-zinc-800" />
                <span className="block h-4 max-w-[11rem] flex-1 animate-pulse rounded bg-zinc-800" />
              </span>
              <span className="block h-4 max-w-[7rem] animate-pulse rounded bg-zinc-800" />
              <span className="block h-4 justify-self-end animate-pulse rounded bg-zinc-900 md:max-w-[5rem]" />
              <span className="block h-4 max-w-[5rem] animate-pulse rounded bg-zinc-900" />
              <span className="block h-6 w-16 max-w-full animate-pulse rounded-full bg-zinc-900" />
              <span className="block h-4 max-w-[8rem] animate-pulse rounded bg-zinc-900" />
              <span className="block h-4 max-w-[9rem] animate-pulse rounded bg-zinc-900" />
            </div>
            <div className="border-t border-zinc-800 px-4 pb-3.5 pt-2">
              <span className="inline-block h-8 w-48 max-w-full animate-pulse rounded-full bg-zinc-900" />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <span className="block h-5 w-5 shrink-0 animate-pulse rounded-[3px] bg-zinc-800" />
                <span className="block h-4 w-40 max-w-[70%] animate-pulse rounded bg-zinc-800" />
              </span>
              <span className="block h-3 w-14 shrink-0 animate-pulse rounded bg-zinc-900" />
            </div>
            <span className="block h-4 w-52 max-w-full animate-pulse rounded bg-zinc-900" />
            <span className="block h-4 w-44 max-w-full animate-pulse rounded bg-zinc-900" />
            <span className="block h-4 w-full max-w-[18rem] animate-pulse rounded bg-zinc-900" />
            <div className="border-t border-zinc-800 pt-2">
              <span className="inline-block h-8 w-44 max-w-full animate-pulse rounded-full bg-zinc-900" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
