import { useNavigate } from "react-router-dom";
import { TrendingLeaderboard } from "@/components/trending-startups/TrendingLeaderboard";
import { useTrendingStartups } from "@/hooks/useTrendingStartups";
import { PLATFORM_WEIGHTS } from "@/lib/trendingStartups/types";

export function MarketTrendingView() {
  const navigate = useNavigate();
  const { data, isLoading } = useTrendingStartups();
  const rows = data?.startups ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Trending</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Early-stage gate, then relative growth delta — launch {Math.round(PLATFORM_WEIGHTS.launch * 100)}%, social{" "}
          {Math.round(PLATFORM_WEIGHTS.social * 100)}% (investor-mentioned only), developer{" "}
          {Math.round(PLATFORM_WEIGHTS.developer * 100)}% (repos under 24 months), traction{" "}
          {Math.round(PLATFORM_WEIGHTS.traction * 100)}%. Click a row for the signal teardown.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading && rows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">Loading the daily board…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            The leaderboard updates at 00:00 UTC. No cached ranks yet.
          </div>
        ) : (
          <TrendingLeaderboard
            rows={rows}
            variant="app"
            onRowClick={(row) => navigate(`/app/startups/${row.id}`)}
          />
        )}
      </div>
    </div>
  );
}
