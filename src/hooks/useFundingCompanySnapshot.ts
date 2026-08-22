import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";
import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";
import {
  snapshotFromOrganization,
  snapshotFromStartup,
  snapshotLookupKeys,
  type FundingCompanySnapshot,
} from "@/lib/fundingCompanySnapshot";

const ORG_SELECT =
  'id, "canonicalName", description, city, state, country, location, website, "logoUrl", domain';

const STARTUP_SELECT =
  "id, company_name, description_short, description_long, hq_city, hq_state, hq_country, location, logo_url, domain";

async function firstOrgMatch(filters: Array<{ column: string; value: string; op: "eq" | "ilike" }>) {
  const client = supabasePublicDirectory as unknown as { from: (t: string) => any };
  for (const filter of filters) {
    try {
      let query = client.from("organizations").select(ORG_SELECT);
      query = filter.op === "eq" ? query.eq(filter.column, filter.value) : query.ilike(filter.column, filter.value);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error || !data) continue;
      return data as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

async function firstStartupMatch(filters: Array<{ column: string; value: string; op: "eq" | "ilike" }>) {
  const client = supabasePublicDirectory as unknown as { from: (t: string) => any };
  for (const filter of filters) {
    try {
      let query = client.from("startups").select(STARTUP_SELECT).is("deleted_at", null);
      query = filter.op === "eq" ? query.eq(filter.column, filter.value) : query.ilike(filter.column, filter.value);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error || !data) continue;
      return data as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchFundingCompanySnapshot(args: {
  companyName: string;
  websiteUrl?: string | null;
}): Promise<FundingCompanySnapshot | null> {
  const { name, escapedName, host } = snapshotLookupKeys(args.companyName, args.websiteUrl);
  if (!name) return null;

  const orgFilters: Array<{ column: string; value: string; op: "eq" | "ilike" }> = [];
  if (host) {
    orgFilters.push({ column: "domain", value: host, op: "eq" });
    orgFilters.push({ column: "website", value: `%${host}%`, op: "ilike" });
  }
  orgFilters.push({ column: "canonicalName", value: escapedName, op: "ilike" });

  const org = await firstOrgMatch(orgFilters);
  if (org) return snapshotFromOrganization(org, name);

  const startupFilters: Array<{ column: string; value: string; op: "eq" | "ilike" }> = [];
  if (host) startupFilters.push({ column: "domain", value: host, op: "eq" });
  startupFilters.push({ column: "company_name", value: escapedName, op: "ilike" });

  const startup = await firstStartupMatch(startupFilters);
  if (startup) return snapshotFromStartup(startup, name);

  return null;
}

export function useFundingCompanySnapshot(
  enabled: boolean,
  companyName: string,
  websiteUrl?: string | null,
) {
  const host = prettyWebsiteHost(websiteUrl);
  return useQuery({
    queryKey: ["funding-company-snapshot", companyName.trim().toLowerCase(), host],
    queryFn: () => fetchFundingCompanySnapshot({ companyName, websiteUrl }),
    enabled: enabled && isSupabaseConfigured && Boolean(companyName.trim()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
