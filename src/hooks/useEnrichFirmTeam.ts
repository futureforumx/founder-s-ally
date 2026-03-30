/**
 * useEnrichFirmTeam
 *
 * Calls the `enrich-firm-team` Supabase edge function to scrape a firm's
 * team page and upsert investor profiles + thought-leadership articles.
 *
 * Usage:
 *   const { enrich, isLoading, result, error } = useEnrichFirmTeam(firmId);
 *   <Button onClick={enrich} disabled={isLoading}>Sync Team</Button>
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EnrichFirmTeamResult = {
  firmId: string;
  firmName: string;
  teamPageUrl: string;
  investorsFound: number;
  added: number;
  updated: number;
  signalsAdded: number;
  errors: string[];
};

export type EnrichFirmTeamState = {
  isLoading: boolean;
  result: EnrichFirmTeamResult | null;
  error: string | null;
  enrich: () => Promise<void>;
  reset: () => void;
};

export function useEnrichFirmTeam(firmId: string | null | undefined): EnrichFirmTeamState {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EnrichFirmTeamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enrich = useCallback(async () => {
    if (!firmId) {
      setError("No firm ID provided");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("enrich-firm-team", {
        body: { firmId },
      });

      if (fnError) {
        setError(fnError.message ?? "Edge function failed");
        return;
      }

      if (data?.error) {
        setError(data.error as string);
        return;
      }

      setResult(data as EnrichFirmTeamResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [firmId]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { isLoading, result, error, enrich, reset };
}
