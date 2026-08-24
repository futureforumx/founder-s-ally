import { cn } from "@/lib/utils";
import { LATEST_FUNDING_TABLE, LatestFundingTableHeader } from "./FundingFeedRow";
import { useFundingFeedApp } from "./fundingFeedSurface";

/** Aligns row rhythm with FundingFeedRow. */
export function FundingFeedSkeleton({ count = 6 }: { count?: number }) {
  const app = useFundingFeedApp();
  const bone = app ? "bg-muted" : "bg-zinc-800";
  const boneDeep = app ? "bg-muted/70" : "bg-zinc-900";
  return (
    <table className={LATEST_FUNDING_TABLE}>
      <LatestFundingTableHeader />
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className={cn("border-b last:border-b-0", app ? "border-border/50" : "border-zinc-800/60")}>
            <td className="px-2 py-3 pl-4 align-middle">
              <span className="inline-flex min-w-0 items-center gap-2.5">
                <span className={cn("block h-6 w-6 shrink-0 animate-pulse rounded-md", bone)} />
                <span className={cn("block h-4 w-40 max-w-full animate-pulse rounded", bone)} />
              </span>
            </td>
            <td className="px-2 py-3 align-middle">
              <span className={cn("block h-3 w-16 animate-pulse rounded", boneDeep)} />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className={cn("block h-5 w-16 animate-pulse rounded-full", boneDeep)} />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className={cn("block h-4 w-12 animate-pulse rounded", bone)} />
            </td>
            <td className="px-2 py-3 align-middle">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={cn("block h-6 w-6 shrink-0 animate-pulse rounded-md", bone)} />
                <span className={cn("block h-4 w-24 animate-pulse rounded", boneDeep)} />
              </span>
            </td>
            <td className="px-2 py-3 align-middle">
              <span className={cn("block h-3 w-20 animate-pulse rounded", boneDeep)} />
            </td>
            <td className="px-2 py-3 pr-4 align-middle">
              <span className={cn("block h-3 w-20 animate-pulse rounded", boneDeep)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
