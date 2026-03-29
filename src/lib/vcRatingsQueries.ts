import { supabaseVcDirectory } from "@/integrations/supabase/client";
import type { VcRatingRow } from "@/lib/vcRatingsAggregate";

const RATING_SELECT =
  "id, author_user_id, interaction_type, interaction_date, interaction_detail, score_resp, score_respect, score_feedback, score_follow_thru, score_value_add, nps, comment, anonymous, verified, is_draft, created_at" as const;

export async function fetchVcRatingsForFirm(firmId: string): Promise<VcRatingRow[]> {
  const { data, error } = await supabaseVcDirectory
    .from("vc_ratings")
    .select(RATING_SELECT)
    .eq("vc_firm_id", firmId)
    .not("is_draft", "eq", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VcRatingRow[];
}
