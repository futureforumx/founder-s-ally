import { useCallback, useEffect, useState } from "react";
import { FreshCapitalHero } from "@/components/fresh-capital/FreshCapitalHero";
import { FreshCapitalLiveFeed } from "@/components/fresh-capital/FreshCapitalLiveFeed";
import {
  FreshCapitalConversion,
  FreshCapitalGatedPreview,
  FreshCapitalHeatmap,
  FreshCapitalWhyMatters,
} from "@/components/fresh-capital/FreshCapitalSections";
import { useFreshCapitalPageData } from "@/hooks/useFreshCapitalPageData";
import { FreshCapitalMisconfiguredError, type FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";

const IS_PROD = import.meta.env.PROD as boolean;
const FEED_SECTION_ID = "fc-live-feed";

export default function FreshCapitalPage() {
  useEffect(() => {
    document.title = "Fresh Capital · Vekta";
  }, []);

  const [stage, setStage] = useState<FreshCapitalStageFilter>("all");
  const [sector, setSector] = useState<string | null>(null);

  const { data, isLoading, error } = useFreshCapitalPageData(stage, sector);

  const misconfigured = error instanceof FreshCapitalMisconfiguredError;
  const rpcFailed = !!error && !misconfigured;

  const handleScrollToFeed = useCallback(() => {
    document.getElementById(FEED_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#050505" }}>
      <FreshCapitalHero onScrollToFeed={handleScrollToFeed} />

      <FreshCapitalLiveFeed
        id={FEED_SECTION_ID}
        rows={data?.funds ?? []}
        loading={isLoading}
        rpcFailed={rpcFailed}
        misconfigured={misconfigured}
        isProductionBuild={IS_PROD}
        stage={stage}
        onStageChange={setStage}
        sector={sector}
        sectorChoices={data?.sectorChoices ?? []}
        onSectorChange={setSector}
        insightsHeatmapBuckets={data?.heatmapBuckets ?? []}
      />

      <FreshCapitalWhyMatters />
      <FreshCapitalGatedPreview />
      <FreshCapitalHeatmap buckets={data?.heatmapBuckets ?? []} />
      <FreshCapitalConversion />
    </div>
  );
}
