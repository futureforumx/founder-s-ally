import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabasePublicDirectory } from "@/integrations/supabase/client";
import type { CompanyProfile, FounderProfile, OperatorProfile } from "@/hooks/useProfile";

const sb = supabasePublicDirectory as any;

/** Matches `import.meta.env.DEV` in CommunityView network logging. */
const logNetworkDirectory =
  import.meta.env.DEV ||
  (typeof import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "string" &&
    import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "1");

/** Columns that exist on all deployed DBs. Omit `current_company_name` until migration `20260416120000_operator_profiles_current_company_name.sql` is applied — otherwise PostgREST errors and returns zero rows. */
const OPERATOR_PROFILE_SELECT =
  "id, full_name, title, bio, avatar_url, linkedin_url, x_url, city, state, country, engagement_type, sector_focus, stage_focus, expertise, prior_companies, is_available";

const PAGE_SIZE = 24;
const PAGE_SIZE_ALL_SLICE = 8;

function safeTrim(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function escapeIlike(s: string): string {
  return safeTrim(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type CommunityGridScope = "all" | "founders" | "companies" | "operators" | "investors";

export interface CommunityGridTotals {
  founders: number | null;
  companies: number | null;
  operators: number | null;
}

export interface UseCommunityGridDataParams {
  isInvestorSearch: boolean;
  activeScope: CommunityGridScope;
  activeFilter: string | null;
}

/**
 * Postgres-backed pagination for Network directory (founders, companies, operators).
 * Canonical Supabase tables:
 * - Founders: `roles` (current founder / CEO / cofounder) → `people`, `organizations`
 * - Companies: `organizations` (ready_for_live, description present)
 * - Operators: `operator_profiles` (ready_for_live, is_available, not deleted)
 */
export function useCommunityGridData({
  isInvestorSearch,
  activeScope,
  activeFilter,
}: UseCommunityGridDataParams) {
  const qRaw = escapeIlike(activeFilter ?? "");
  const hasQ = qRaw.length > 0;
  const qLower = qRaw.toLowerCase();
  const orOrganizations = hasQ
    ? `canonicalName.ilike.%${qRaw}%,description.ilike.%${qRaw}%,industry.ilike.%${qRaw}%`
    : null;
  const orOperators = hasQ
    ? `full_name.ilike.%${qRaw}%,bio.ilike.%${qRaw}%,title.ilike.%${qRaw}%,stage_focus.ilike.%${qRaw}%`
    : null;

  const [founders, setFounders] = useState<FounderProfile[]>([]);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [operators, setOperators] = useState<OperatorProfile[]>([]);

  const [totals, setTotals] = useState<CommunityGridTotals>({
    founders: null,
    companies: null,
    operators: null,
  });

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Re-render when founder cursor exhausts (refs alone do not trigger updates). */
  const [foundersDone, setFoundersDone] = useState(false);

  const foundersRef = useRef<FounderProfile[]>([]);
  useEffect(() => {
    foundersRef.current = founders;
  }, [founders]);

  const founderCursorRef = useRef<string | null>(null);
  const companyOffsetRef = useRef(0);
  const operatorOffsetRef = useRef(0);

  const enabled = !isInvestorSearch && activeScope !== "investors";

  const fetchFounderTotals = useCallback(async () => {
    const { data, error: rpcError } = await sb.rpc("community_founders_distinct_count");
    if (rpcError) {
      console.warn("[useCommunityGridData] founder count RPC unavailable:", rpcError.message);
      return null;
    }
    if (data == null) return null;
    return typeof data === "bigint" ? Number(data) : Number(data);
  }, []);

  const fetchCompanyCount = useCallback(async () => {
    let query = sb
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .not("description", "is", null)
      .eq("ready_for_live", true);
    if (orOrganizations) query = query.or(orOrganizations);
    const { count, error: cErr } = await query;
    if (cErr) {
      console.warn("[useCommunityGridData] company count:", cErr.message);
      return null;
    }
    return count ?? 0;
  }, [orOrganizations]);

  const fetchOperatorCount = useCallback(async () => {
    let query = sb
      .from("operator_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_available", true)
      .eq("ready_for_live", true);
    if (orOperators) query = query.or(orOperators);
    const { count, error: oErr } = await query;
    if (oErr) {
      console.warn("[useCommunityGridData] operator count:", oErr.message);
      return null;
    }
    return count ?? 0;
  }, [orOperators]);

  const loadFounderBatch = useCallback(
    async (reset: boolean, batchLimit = 120) => {
      const batch = Math.min(120, Math.max(1, batchLimit));
      let qRoles = sb
        .from("roles")
        .select(
          `
            "personId",
            title,
            "roleType",
            person:people(
              id,
              "canonicalName",
              "firstName",
              "lastName",
              "linkedinUrl",
              "twitterUrl",
              "avatarUrl",
              bio,
              city,
              country
            ),
            organization:organizations(
              "canonicalName",
              industry,
              city,
              country,
              website
            )
          `,
        )
        .in("roleType", ["founder", "cofounder", "ceo"])
        .eq("isCurrent", true)
        .not("person", "is", null)
        .order("personId", { ascending: true })
        .limit(batch);

      if (!reset && founderCursorRef.current) {
        qRoles = qRoles.gt("personId", founderCursorRef.current);
      }

      const { data: roles, error: rolesError } = await qRoles;
      if (rolesError || !roles?.length) {
        if (rolesError) console.warn("[useCommunityGridData] roles:", rolesError.message);
        return { rows: [] as FounderProfile[], exhausted: true };
      }

      const seen = new Set<string>();
      if (!reset) {
        for (const f of foundersRef.current) {
          if (f.id) seen.add(f.id);
        }
      }

      const out: FounderProfile[] = [];
      const lastRole = (roles as any[])[(roles as any[]).length - 1];
      const batchEndPersonId: string | null = lastRole?.personId ?? lastRole?.person?.id ?? null;

      for (const r of roles as any[]) {
        const p = r.person;
        if (!p?.id || seen.has(p.id)) continue;
        const org = r.organization;
        const fullName = p.canonicalName || `${p.firstName || ""} ${p.lastName || ""}`.trim();
        if (hasQ) {
          const hay = `${fullName} ${org?.canonicalName || ""} ${org?.industry || ""} ${p.bio || ""}`.toLowerCase();
          if (!hay.includes(qLower)) continue;
        }
        seen.add(p.id);
        out.push({
          id: p.id,
          user_id: p.id,
          full_name: fullName || "Unknown",
          title: r.title || "Founder",
          bio: p.bio || null,
          location: [p.city, p.country].filter(Boolean).join(", ") || null,
          user_type: "founder",
          avatar_url: p.avatarUrl || null,
          company_id: null,
          linkedin_url: p.linkedinUrl || null,
          twitter_url: p.twitterUrl || null,
          resume_url: null,
          is_public: true,
          company_name: org?.canonicalName || null,
          company_sector: org?.industry || null,
          company_stage: null,
          company_competitors: null,
          company_website: org?.website ?? null,
        });
      }

      if (batchEndPersonId) founderCursorRef.current = batchEndPersonId;
      const exhausted = (roles as any[]).length < batch;
      return { rows: out, exhausted };
    },
    [hasQ, qLower],
  );

  const loadCompanyPage = useCallback(
    async (offset: number, limit: number) => {
      let query = sb
        .from("organizations")
        .select(
          `
            id,
            "canonicalName",
            description,
            industry,
            city,
            country,
            website,
            "logoUrl",
            "foundedYear",
            "isYcBacked",
            "ycBatch",
            "employeeCount",
            "fundingStatus",
            "vcBacked",
            "investmentStage"
          `,
        )
        .not("description", "is", null)
        .eq("ready_for_live", true)
        .order("canonicalName", { ascending: true })
        .range(offset, offset + limit - 1);
      if (orOrganizations) query = query.or(orOrganizations);
      const { data, error: err } = await query;
      if (err) {
        console.warn("[useCommunityGridData] organizations:", err.message);
        return [] as CompanyProfile[];
      }
      return ((data as any[]) ?? []).map((o) => ({
        id: o.id,
        name: o.canonicalName,
        description: o.description,
        sector: o.industry,
        city: o.city,
        country: o.country,
        website: o.website,
        logo_url: o.logoUrl,
        founded_year: o.foundedYear,
        is_yc_backed: o.isYcBacked ?? false,
        yc_batch: o.ycBatch,
        employee_count: o.employeeCount,
        funding_status: typeof o.fundingStatus === "string" ? o.fundingStatus : null,
        vc_backed: o.vcBacked === true ? true : o.vcBacked === false ? false : null,
        investment_stage: typeof o.investmentStage === "string" ? o.investmentStage : null,
      })) as CompanyProfile[];
    },
    [orOrganizations],
  );

  const loadOperatorPage = useCallback(
    async (offset: number, limit: number) => {
      let query = sb
        .from("operator_profiles")
        .select(OPERATOR_PROFILE_SELECT)
        .is("deleted_at", null)
        .eq("is_available", true)
        .eq("ready_for_live", true)
        .order("full_name", { ascending: true })
        .range(offset, offset + limit - 1);
      if (orOperators) query = query.or(orOperators);
      const { data, error: err } = await query;
      if (logNetworkDirectory) {
        console.info("[useCommunityGridData] operator_profiles query", {
          offset,
          limit,
          rawRowCount: (data ?? []).length,
          error: err?.message ?? null,
          code: (err as { code?: string } | null)?.code ?? null,
        });
      }
      if (err) {
        console.warn("[useCommunityGridData] operator_profiles:", err.message);
        return [] as OperatorProfile[];
      }
      return (data ?? []) as OperatorProfile[];
    },
    [orOperators],
  );

  useEffect(() => {
    if (!enabled) {
      founderCursorRef.current = null;
      companyOffsetRef.current = 0;
      operatorOffsetRef.current = 0;
      setFounders([]);
      setCompanies([]);
      setOperators([]);
      setTotals({ founders: null, companies: null, operators: null });
      setFoundersDone(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      founderCursorRef.current = null;
      companyOffsetRef.current = 0;
      operatorOffsetRef.current = 0;
      setFounders([]);
      setCompanies([]);
      setOperators([]);
      setFoundersDone(false);

      try {
        /** Include founders/companies when browsing Operators so Network tabs (All / Companies / Founders) and rails have data. */
        const needF = activeScope === "all" || activeScope === "founders" || activeScope === "operators";
        const needC = activeScope === "all" || activeScope === "companies" || activeScope === "operators";
        const needO = activeScope === "all" || activeScope === "operators";

        const [fc, cc, oc] = await Promise.all([
          needF ? fetchFounderTotals() : Promise.resolve(null),
          needC ? fetchCompanyCount() : Promise.resolve(null),
          needO ? fetchOperatorCount() : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setTotals({
          founders: needF ? fc : null,
          companies: needC ? cc : null,
          operators: needO ? oc : null,
        });

        let firstFounders = 0;
        let firstCompanies = 0;
        let firstOperators = 0;

        if (activeScope === "founders") {
          const { rows, exhausted } = await loadFounderBatch(true);
          if (cancelled) return;
          firstFounders = rows.length;
          setFounders(rows);
          setFoundersDone(exhausted);
        } else if (activeScope === "companies") {
          const c = await loadCompanyPage(0, PAGE_SIZE);
          if (cancelled) return;
          firstCompanies = c.length;
          setCompanies(c);
          companyOffsetRef.current = c.length;
        } else if (activeScope === "operators") {
          const [fBatch, c, o] = await Promise.all([
            loadFounderBatch(true, PAGE_SIZE_ALL_SLICE),
            loadCompanyPage(0, PAGE_SIZE_ALL_SLICE),
            loadOperatorPage(0, PAGE_SIZE),
          ]);
          if (cancelled) return;
          const f = fBatch.rows;
          firstFounders = f.length;
          firstCompanies = c.length;
          firstOperators = o.length;
          setFounders(f);
          /** Shallow preview only — full founder pagination starts when user opens Founders or All. */
          setFoundersDone(true);
          setCompanies(c);
          setOperators(o);
          companyOffsetRef.current = c.length;
          operatorOffsetRef.current = o.length;
        } else if (activeScope === "all") {
          const [{ rows: f, exhausted: fEx }, c, o] = await Promise.all([
            loadFounderBatch(true),
            loadCompanyPage(0, PAGE_SIZE_ALL_SLICE),
            loadOperatorPage(0, PAGE_SIZE_ALL_SLICE),
          ]);
          if (cancelled) return;
          firstFounders = f.length;
          firstCompanies = c.length;
          firstOperators = o.length;
          setFounders(f);
          setFoundersDone(fEx);
          setCompanies(c);
          setOperators(o);
          companyOffsetRef.current = c.length;
          operatorOffsetRef.current = o.length;
        }

        const logNetwork =
          import.meta.env.DEV ||
          (typeof import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "string" &&
            import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "1");
        if (logNetwork) {
          console.info("[useCommunityGridData]", {
            scope: activeScope,
            filter: activeFilter,
            totals: { founders: fc, companies: cc, operators: oc },
            firstPageRows: {
              founders: firstFounders,
              companies: firstCompanies,
              operators: firstOperators,
            },
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Directory load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    activeScope,
    activeFilter,
    fetchCompanyCount,
    fetchFounderTotals,
    fetchOperatorCount,
    loadCompanyPage,
    loadFounderBatch,
    loadOperatorPage,
  ]);

  const loadMore = useCallback(async () => {
    if (!enabled || loading || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      if (activeScope === "founders") {
        if (foundersDone) return;
        const { rows, exhausted } = await loadFounderBatch(false);
        if (rows.length) setFounders((prev) => [...prev, ...rows]);
        setFoundersDone(exhausted);
      } else if (activeScope === "companies") {
        const off = companyOffsetRef.current;
        const next = await loadCompanyPage(off, PAGE_SIZE);
        if (next.length) {
          companyOffsetRef.current = off + next.length;
          setCompanies((prev) => [...prev, ...next]);
        }
      } else if (activeScope === "operators") {
        const off = operatorOffsetRef.current;
        const next = await loadOperatorPage(off, PAGE_SIZE);
        if (next.length) {
          operatorOffsetRef.current = off + next.length;
          setOperators((prev) => [...prev, ...next]);
        }
      } else if (activeScope === "all") {
        const [{ rows: fNext, exhausted: fEx }, cNext, oNext] = await Promise.all([
          foundersDone ? Promise.resolve({ rows: [] as FounderProfile[], exhausted: true }) : loadFounderBatch(false),
          loadCompanyPage(companyOffsetRef.current, PAGE_SIZE_ALL_SLICE),
          loadOperatorPage(operatorOffsetRef.current, PAGE_SIZE_ALL_SLICE),
        ]);
        if (fNext.length) setFounders((prev) => [...prev, ...fNext]);
        if (fEx) setFoundersDone(true);
        if (cNext.length) {
          companyOffsetRef.current += cNext.length;
          setCompanies((prev) => [...prev, ...cNext]);
        }
        if (oNext.length) {
          operatorOffsetRef.current += oNext.length;
          setOperators((prev) => [...prev, ...oNext]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load more failed");
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeScope,
    enabled,
    foundersDone,
    loadCompanyPage,
    loadFounderBatch,
    loadOperatorPage,
    loading,
    loadingMore,
  ]);

  const totalForScope = useMemo(() => {
    if (!enabled) return null;
    if (activeScope === "founders") return totals.founders;
    if (activeScope === "companies") return totals.companies;
    if (activeScope === "operators") return totals.operators;
    if (activeScope === "all") {
      if (totals.founders == null && totals.companies == null && totals.operators == null) return null;
      return (totals.founders ?? 0) + (totals.companies ?? 0) + (totals.operators ?? 0);
    }
    return null;
  }, [activeScope, enabled, totals.companies, totals.founders, totals.operators]);

  const loadedCount = useMemo(() => {
    if (activeScope === "founders") return founders.length;
    if (activeScope === "companies") return companies.length;
    if (activeScope === "operators") return operators.length;
    if (activeScope === "all") return founders.length + companies.length + operators.length;
    return 0;
  }, [activeScope, companies.length, founders.length, operators.length]);

  const hasMore = useMemo(() => {
    if (!enabled) return false;
    if (totalForScope != null && loadedCount >= totalForScope) return false;
    if (activeScope === "founders") return !foundersDone;
    if (activeScope === "companies") {
      if (totals.companies != null) return companies.length < totals.companies;
      return companies.length > 0 && companies.length % PAGE_SIZE === 0;
    }
    if (activeScope === "operators") {
      if (totals.operators != null) return operators.length < totals.operators;
      return operators.length > 0 && operators.length % PAGE_SIZE === 0;
    }
    if (activeScope === "all") {
      const cMore = totals.companies == null || companies.length < totals.companies;
      const oMore = totals.operators == null || operators.length < totals.operators;
      const fMore = !foundersDone;
      return cMore || oMore || fMore;
    }
    return false;
  }, [
    activeScope,
    companies.length,
    enabled,
    foundersDone,
    loadedCount,
    operators.length,
    totalForScope,
    totals.companies,
    totals.operators,
  ]);

  return {
    founders,
    companies,
    operators,
    totals,
    totalForScope,
    loadedCount,
    loading,
    loadingMore,
    error,
    loadMore,
    hasMore,
    pageSize: PAGE_SIZE,
  };
}
