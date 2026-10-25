import { supabasePublicDirectory } from "@/integrations/supabase/client";
import { trackMixpanelEvent } from "@/lib/mixpanel";

export type ProductSearchSource = "omnibar" | "ai_home";

export function trackProductSearch({
  source,
  query,
  userId,
  resultsCount,
}: {
  source: ProductSearchSource;
  query: string;
  userId?: string | null;
  resultsCount?: number;
}): void {
  const trimmed = query.trim();
  if (!trimmed) return;

  trackMixpanelEvent("Search", {
    search_query: trimmed,
    source,
    ...(typeof resultsCount === "number" ? { results_count: resultsCount } : {}),
    ...(userId ? { user_id: userId } : {}),
  });

  void supabasePublicDirectory
    .from("product_searches")
    .insert({
      source,
      query: trimmed.slice(0, 280),
      user_id: userId ?? null,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn("[product-search] persist failed", error.message);
      }
    });
}
