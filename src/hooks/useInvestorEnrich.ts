import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EnrichedProfile {
  firmName: string;
  logoUrl: string;
  recentDeals: string[];
  currentThesis: string;
  stage: string;
  geography: string;
  typicalCheckSize: string;
  confidenceScore: number;
  source: "exa" | "gemini_grounded" | "local_db";
  lastVerified: string;
}

export interface EnrichResult {
  profile: EnrichedProfile;
  tier: number; // 1=Exa, 2=Gemini, 3=LocalDB, 0=nothing
}

export function useInvestorEnrich() {
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, EnrichResult>>({});

  const enrich = useCallback(async (investorName: string): Promise<EnrichResult | null> => {
    const key = investorName.toLowerCase().trim();
    if (cache[key]) return cache[key];

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("investor-enrich", {
        body: { investorName },
      });

      if (error) {
        console.error("investor-enrich error:", error);
        return null;
      }

      const result = data as EnrichResult;
      setCache(prev => ({ ...prev, [key]: result }));
      return result;
    } catch (e) {
      console.error("investor-enrich failed:", e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cache]);

  return { enrich, loading, cache };
}
