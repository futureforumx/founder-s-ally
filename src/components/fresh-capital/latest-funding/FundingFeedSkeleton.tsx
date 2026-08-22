import { LATEST_FUNDING_TABLE, LatestFundingTableHeader } from "./FundingFeedRow";

/** Aligns row rhythm with FundingFeedRow. */
export function FundingFeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <table className={LATEST_FUNDING_TABLE}>
      <LatestFundingTableHeader />
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className="border-b border-zinc-800/60 last:border-b-0">
            <td className="px-2 py-3 pl-4 align-middle">
              <span className="inline-flex min-w-0 items-center gap-2.5">
                <span className="block h-6 w-6 shrink-0 animate-pulse rounded-md bg-zinc-800" />
                <span className="block h-4 w-40 max-w-full animate-pulse rounded bg-zinc-800" />
              </span>
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="block h-3 w-16 animate-pulse rounded bg-zinc-900" />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="block h-5 w-16 animate-pulse rounded-full bg-zinc-900" />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="block h-4 w-12 animate-pulse rounded bg-zinc-800" />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="block h-6 w-6 shrink-0 animate-pulse rounded-md bg-zinc-800" />
                <span className="block h-4 w-24 animate-pulse rounded bg-zinc-900" />
              </span>
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="block h-3 w-20 animate-pulse rounded bg-zinc-900" />
            </td>
            <td className="px-2 py-3 pr-4 align-middle">
              <span className="block h-3 w-20 animate-pulse rounded bg-zinc-900" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
