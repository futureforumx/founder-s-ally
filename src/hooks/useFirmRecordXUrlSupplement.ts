import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InvestorProfile } from "@/hooks/useInvestorProfile";
import { looksLikeFirmRecordsUuid, pickFirmXUrl } from "@/lib/pickFirmXUrl";

type VcFirmLike = { id: string; x_url?: string | null };

/**
 * When `liveProfile` or `vcFirm` omits `x_url`, load X from `firm_records` by UUID `id`
 * or by `prisma_firm_id` ↔ VC directory `vc_firms.id`.
 */
export function useFirmRecordXUrlSupplement(
  liveProfile: InvestorProfile | null | undefined,
  vcFirm: VcFirmLike | null | undefined,
  databaseFirmId: string | null | undefined,
) {
  const hasDirect =
    Boolean(liveProfile?.x_url?.trim()) || Boolean(vcFirm?.x_url?.trim());

  return useQuery({
    queryKey: [
      "firm-record-x-supplement",
      liveProfile?.id,
      liveProfile?.source,
      databaseFirmId,
      vcFirm?.id,
    ],
    enabled:
      !hasDirect &&
      Boolean(
        vcFirm?.id ||
          (databaseFirmId && looksLikeFirmRecordsUuid(databaseFirmId)) ||
          (liveProfile?.source === "live" && liveProfile.id && looksLikeFirmRecordsUuid(liveProfile.id)),
      ),
    queryFn: async (): Promise<string | null> => {
      const tryRow = async (filter: { column: "id" | "prisma_firm_id"; value: string }) => {
        const { data, error } = await supabase
          .from("firm_records")
          .select("*")
          .eq(filter.column, filter.value)
          .maybeSingle();
        if (error) throw error;
        return pickFirmXUrl(data as Record<string, unknown>);
      };

      if (liveProfile?.source === "live" && liveProfile.id && looksLikeFirmRecordsUuid(liveProfile.id)) {
        const x = await tryRow({ column: "id", value: liveProfile.id });
        if (x) return x;
      }

      if (databaseFirmId && looksLikeFirmRecordsUuid(databaseFirmId)) {
        const x = await tryRow({ column: "id", value: databaseFirmId });
        if (x) return x;
      }

      if (vcFirm?.id) {
        return tryRow({ column: "prisma_firm_id", value: vcFirm.id });
      }

      return null;
    },
    staleTime: 60_000,
  });
}
