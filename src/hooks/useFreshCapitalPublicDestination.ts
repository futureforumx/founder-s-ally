import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";
import {
  BUILTIN_FRESH_CAPITAL_PUBLIC_PATHS,
  isReservedAppPathSlug,
  parseFreshCapitalPublicDestination,
  type FreshCapitalPublicDestination,
} from "@/lib/freshCapitalPublicPaths";

export async function resolveFreshCapitalPublicDestination(
  slug: string,
): Promise<FreshCapitalPublicDestination | null> {
  if (!slug || isReservedAppPathSlug(slug)) return null;

  if (isSupabaseConfigured) {
    const { data, error } = await supabasePublicDirectory
      .from("fresh_capital_public_paths")
      .select("destination")
      .eq("path_slug", slug)
      .maybeSingle();
    if (!error) {
      const dest = parseFreshCapitalPublicDestination(
        (data as { destination?: unknown } | null)?.destination,
      );
      if (dest) return dest;
    } else if (import.meta.env.DEV) {
      console.warn("[freshCapitalPublicPaths]", error.message);
    }
  }

  return BUILTIN_FRESH_CAPITAL_PUBLIC_PATHS[slug] ?? null;
}

export function useFreshCapitalPublicDestination(slug: string | null) {
  return useQuery({
    queryKey: ["fresh-capital-public-path", slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => resolveFreshCapitalPublicDestination(slug ?? ""),
  });
}
