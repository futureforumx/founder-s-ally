import { LatestFundingFeed } from "@/components/fresh-capital/latest-funding/LatestFundingFeed";

export function MarketFundingView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Funding</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Latest company raises and deal headlines</p>
      </div>

      <LatestFundingFeed stage="all" sector={null} />
    </div>
  );
}
