import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildVerticalPatterns,
  hasFitInputs,
  rankInvestorFits,
  stageFocusFor,
  type CompanyFitInput,
  type FitInvestor,
  type InvestorFit,
} from "@/lib/investorFit";

/**
 * Investors ranked against the Company Details fields. Candidate selection runs
 * in Postgres (match_investors_for_company); scoring and reasons stay in
 * src/lib/investorFit.ts so they're testable without a database.
 */
export function useInvestorFitMatches(company: CompanyFitInput, limit = 5) {
  const [candidates, setCandidates] = useState<FitInvestor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stages = stageFocusFor(company.stage);
  const patterns = buildVerticalPatterns(company);
  // Primitive keys, so a re-rendered profile object doesn't refetch.
  const stageKey = stages?.join("|") ?? "";
  const patternKey = patterns?.join("|") ?? "";
  const ready = hasFitInputs(company);

  useEffect(() => {
    if (!ready) {
      setCandidates([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase.rpc("match_investors_for_company" as never, {
        p_stages: stageKey ? stageKey.split("|") : null,
        p_vertical_patterns: patternKey ? patternKey.split("|") : null,
        p_limit: 300,
      } as never);

      if (cancelled) return;
      if (error) {
        console.error("Failed to load investor matches:", error);
        setCandidates([]);
        setError(error.message);
      } else {
        setCandidates((data || []) as unknown as FitInvestor[]);
        setError(null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, stageKey, patternKey]);

  const matches: InvestorFit[] = useMemo(
    () => (candidates ? rankInvestorFits(candidates, company, limit) : []),
    // `company` is read inside rankInvestorFits; the primitive keys below cover
    // every field it actually looks at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      candidates,
      limit,
      company.sector,
      company.industry,
      company.stage,
      company.geo,
      company.businessModel?.join("|"),
      company.targetCustomer?.join("|"),
    ],
  );

  return { matches, loading, hasInputs: ready, error };
}
