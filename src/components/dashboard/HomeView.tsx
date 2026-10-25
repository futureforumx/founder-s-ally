import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyProfileFields } from "@/hooks/useCompanyProfileFields";
import { useInvestorFitMatches } from "@/hooks/useInvestorFitMatches";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { useVCInteractions } from "@/hooks/useVCInteractions";
import { normalizeGeoLabel, type CompanyFitInput, type InvestorFit } from "@/lib/investorFit";
import { bridgeOldSector } from "@/components/company-profile/sectorNormalization";
import type { WebSource } from "@/components/ui/web-search";
import { trackProductSearch } from "@/lib/productSearchAnalytics";
import { IntelligenceLanding } from "./IntelligenceLanding";
import { IntelligenceResults, type IntelligenceQueryState } from "./IntelligenceResults";
import type { SearchResult } from "./SearchOmnibar";

interface HomeViewProps {
  onViewChange: (view: string) => void;
  companyName?: string | null;
}

function toInvestorSearchResult(match: InvestorFit): SearchResult {
  const details = [
    match.stage_focus.length ? `Stages: ${match.stage_focus.slice(0, 3).join(", ")}` : null,
    match.thesis_verticals.length ? `Focus: ${match.thesis_verticals.slice(0, 3).join(", ")}` : null,
    match.geo_focus.length ? `Geography: ${match.geo_focus.slice(0, 2).join(", ")}` : null,
  ].filter(Boolean);

  return {
    name: match.firm_name,
    subtitle: details.join(" · ") || "Investor profile in the live Vekta directory",
    category: "investor",
    matchReason: match.reasons.join(" · "),
    matchScore: match.score,
    firmId: match.id,
    logoUrl: match.logo_url,
    websiteUrl: match.website_url,
  };
}

export function HomeView({ onViewChange, companyName }: HomeViewProps) {
  const { user } = useAuth();
  const { profile: storedProfile } = useCompanyProfileFields();
  const { firms, peopleByFirm } = useVCDirectory();
  const { savedFirmIds, recordInteraction } = useVCInteractions(user?.id);
  const fitProfile = useMemo<CompanyFitInput>(() => ({
    stage: storedProfile.stage,
    sector: storedProfile.sector ? bridgeOldSector(storedProfile.sector) : storedProfile.sector,
    industry: [storedProfile.industry, ...(storedProfile.subsectors ?? [])].filter(Boolean).join(" "),
    businessModel: storedProfile.businessModel,
    targetCustomer: storedProfile.targetCustomer,
    geo: storedProfile.geo || normalizeGeoLabel(storedProfile.hqLocation ?? ""),
  }), [storedProfile]);
  const { matches, loading: matchesLoading, hasInputs, error: matchesError } = useInvestorFitMatches(fitProfile, 18);

  const [query, setQuery] = useState("");
  const [queryState, setQueryState] = useState<IntelligenceQueryState>("idle");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [synthesis, setSynthesis] = useState("");
  const [sources, setSources] = useState<WebSource[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const submitQuery = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    trackProductSearch({ source: "ai_home", query: trimmed, userId: user?.id });
    setQuery(trimmed);
    setQueryState("submitted");
    setPendingQuery(trimmed);
    setSearchError(null);
    setResults([]);
    setSynthesis("");
    setSources([]);
  }, [user?.id]);

  useEffect(() => {
    if (queryState !== "submitted") return;
    const timer = window.setTimeout(() => {
      setQueryState((state) => state === "submitted" ? "streaming" : state);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [queryState]);

  useEffect(() => {
    if (!pendingQuery || queryState === "idle" || matchesLoading) return;

    if (matchesError) {
      const message = `Investor database search failed: ${matchesError}`;
      setSearchError(message);
      setSynthesis("We couldn't load investor matches from the Vekta database. Please try again shortly.");
      toast.error("Investor search couldn’t be completed", { description: matchesError });
    } else if (!hasInputs) {
      setSynthesis("Add your company’s funding stage or sector in your profile to find matching investors from the Vekta database.");
    } else {
      const investorResults = matches.map(toInvestorSearchResult);
      setResults(investorResults);
      const criteria = [
        fitProfile.stage && `${fitProfile.stage} stage`,
        fitProfile.industry || fitProfile.sector,
        fitProfile.businessModel?.[0],
        fitProfile.targetCustomer?.[0],
        fitProfile.geo,
      ].filter(Boolean);
      setSynthesis(investorResults.length
        ? `Found ${investorResults.length} investors in the Vekta database, ranked against your profile${criteria.length ? ` (${criteria.join(" · ")})` : ""}. Match reasons reflect the firm’s recorded thesis, stage, business model, customer focus, and geography.`
        : `No live investor records matched the profile details available${criteria.length ? ` (${criteria.join(" · ")})` : ""}. Update your company stage or sector to broaden the database match.`);
    }

    setPendingQuery(null);
    setQueryState("complete");
  }, [pendingQuery, queryState, matchesLoading, matchesError, hasInputs, matches, fitProfile]);

  const onSave = useCallback((firmId: string) => {
    recordInteraction.mutate({ firmId, action: "saved" }, {
      onSuccess: () => toast.success("Saved to your investor CRM"),
      onError: () => toast.error("Could not save this investor"),
    });
  }, [recordInteraction]);

  if (queryState !== "idle") {
    return (
      <IntelligenceResults
        query={query}
        queryState={queryState}
        results={results}
        synthesis={synthesis}
        sources={sources}
        searchError={searchError}
        firms={firms}
        peopleByFirm={peopleByFirm}
        savedFirmIds={savedFirmIds}
        onSave={onSave}
        onSubmit={submitQuery}
        onBack={() => setQueryState("idle")}
        companyName={companyName || "your company"}
      />
    );
  }

  return (
    <IntelligenceLanding
      query={query}
      onQueryChange={setQuery}
      onSubmit={submitQuery}
      onViewChange={onViewChange}
      companyName={companyName}
    />
  );
}
