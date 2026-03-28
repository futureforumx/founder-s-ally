// ---------------------------------------------------------------------------
// useInvestorMapping.ts
// Checks whether a given investor firm name is mapped to the current founder's
// company profile (i.e., exists in their cap_table).
//
// Returns:
//   isMapped          – true if the firm is a confirmed investor
//   mappingRecordId   – the cap_table.id of the matching row (or null)
//   loading           – while the async lookup is in progress
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InvestorMappingResult {
  isMapped: boolean;
  mappingRecordId: string | null;
  loading: boolean;
}

/**
 * Normalise a firm name for fuzzy matching: lowercase, strip punctuation,
 * collapse whitespace. Keeps the check consistent between cap_table entries
 * (which may have slightly different casing/formatting) and the VC directory.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useInvestorMapping(firmName: string | null | undefined): InvestorMappingResult {
  const { user } = useAuth();
  const [isMapped, setIsMapped] = useState(false);
  const [mappingRecordId, setMappingRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firmName) {
      setIsMapped(false);
      setMappingRecordId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Pull all cap_table rows for this user and match client-side so we
        // get the same normalisation logic on both sides.
        const { data, error } = await supabase
          .from("cap_table")
          .select("id, investor_name")
          .eq("user_id", user.id);

        if (cancelled) return;

        if (error || !data) {
          setIsMapped(false);
          setMappingRecordId(null);
          return;
        }

        const target = normalise(firmName);
        const match = data.find((row) => normalise(row.investor_name) === target);

        setIsMapped(!!match);
        setMappingRecordId(match?.id ?? null);
      } catch {
        if (!cancelled) {
          setIsMapped(false);
          setMappingRecordId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, firmName]);

  return { isMapped, mappingRecordId, loading };
}
