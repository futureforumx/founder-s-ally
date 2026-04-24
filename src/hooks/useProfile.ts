import { useState, useEffect, useCallback } from "react";
import { supabase, supabasePublicDirectory, supabaseVcDirectory } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  normalizeProfileRowForRead,
  normalizeProfileRowsForRead,
} from "@/lib/profileRead"; // full-row reads: profiles table + normalization (see module doc there)
import { completeFounderOnboardingEdge } from "@/lib/completeFounderOnboardingEdge";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  bio: string | null;
  location: string | null;
  user_type: string;
  avatar_url: string | null;
  company_id: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  resume_url: string | null;
  is_public: boolean;
}

export interface FounderProfile extends Profile {
  company_name: string | null;
  company_sector: string | null;
  company_stage: string | null;
  company_competitors: string[] | null;
  /** Joined organization `website` when present (directory / roles join). */
  company_website?: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      // Primary path: service-role API route (bypasses PostgREST JWT verification).
      // Required because WorkOS JWTs are not configured as a trusted issuer in this
      // Supabase project, so direct supabase.from() queries return PGRST301.
      let apiData: Record<string, unknown> | null = null;
      try {
        const { getClerkSessionToken: getToken } = await import("@/lib/clerkSessionForEdge");
        const jwt = await getToken().catch(() => null);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
        const resp = await fetch("/api/get-profile", {
          method: "POST",
          headers,
          body: JSON.stringify({ _uid: user.id }),
        });
        if (resp.ok) {
          const json = await resp.json() as { ok?: boolean; profile?: Record<string, unknown> | null };
          if (json.ok) apiData = json.profile ?? null;
        }
      } catch {
        // API not available — fall through to direct query
      }

      if (apiData !== null) {
        setProfile(apiData ? (normalizeProfileRowForRead(apiData) as Profile) : null);
        return;
      }

      // Fallback: direct Supabase query (works if WorkOS JWT is a trusted issuer,
      // or if the profile is public and anon SELECT policy applies).
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("Failed to fetch profile:", error);
        setProfile(null);
      } else {
        setProfile(
          data
            ? (normalizeProfileRowForRead(data as Record<string, unknown>) as Profile)
            : null,
        );
      }
    } catch (err) {
      console.warn("Error fetching profile:", err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const upsertProfile = useCallback(
    async (updates: Partial<Profile>): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user) return { ok: false, error: "Not signed in" };

      const p = updates as any;

      // ── Path 1: Vercel API route (primary, works in both dev and production) ──────
      // Uses Clerk JWT verified server-side + Supabase service role key on the server.
      // No Clerk JWT template or Supabase third-party auth config required.
      {
        const clerkJwt = await getClerkSessionToken().catch(() => null);
        if (clerkJwt) {
          try {
            const apiUrl = "/api/save-profile";
            const body: Record<string, unknown> = { _uid: user.id };
            const allowed = ["full_name","title","bio","location","avatar_url","linkedin_url","twitter_url","user_type","resume_url","company_id","has_completed_onboarding","has_seen_settings_tour"] as const;
            for (const k of allowed) if (k in p && p[k] !== undefined) body[k] = p[k];

            const resp = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${clerkJwt}`,
              },
              body: JSON.stringify(body),
            });

            // Only treat as "not deployed" if it's a 404 AND the body isn't JSON
            if (resp.status === 404) {
              // API route not yet deployed — fall through to next path
            } else if (!resp.ok) {
              const text = await resp.text().catch(() => `HTTP ${resp.status}`);
              return { ok: false, error: `Save failed (${resp.status}): ${text.slice(0, 200)}` };
            } else {
              const contentType = resp.headers.get("content-type") ?? "";
              if (contentType.includes("application/json")) {
                const json = await resp.json() as { ok?: boolean; error?: string };
                if (json.ok) {
                  await fetchProfile();
                  return { ok: true };
                }
                if (json.error) return { ok: false, error: json.error };
              }
              // Non-JSON 200 means the SPA catch-all served index.html (route not active) — fall through
            }
          } catch {
            // Network error — fall through
          }
        }
      }

      // ── Path 1.5: Direct Supabase client write (WorkOS JWT — sub == profiles.user_id) ─
      // RLS: auth.jwt() ->> 'sub' = user_id  →  WorkOS JWT sub matches, direct write works.
      // This is the primary path when Clerk is not in use.
      {
        const allowed = ["full_name","title","bio","location","avatar_url","linkedin_url","twitter_url","user_type","resume_url","company_id","has_completed_onboarding","has_seen_settings_tour"] as const;
        const directUpdates: Record<string, unknown> = {};
        for (const k of allowed) if (k in p && p[k] !== undefined) directUpdates[k] = p[k];

        if (Object.keys(directUpdates).length > 0) {
          const { error: directError } = await (supabase as any)
            .from("profiles")
            .update(directUpdates)
            .eq("user_id", user.id);

          if (!directError) {
            await fetchProfile();
            return { ok: true };
          }
          // RLS mismatch or other error — log and fall through
          console.warn("[upsertProfile] Direct write failed:", directError.message);
        }
      }

      // ── Path 2: SECURITY DEFINER RPC (if SQL migration has been applied) ─────────
      const { data: rpcData, error: rpcError } = await (supabaseVcDirectory as any).rpc(
        "upsert_own_profile",
        {
          p_user_id:      user.id,
          p_full_name:    p.full_name    ?? null,
          p_title:        p.title        ?? null,
          p_bio:          p.bio          ?? null,
          p_location:     p.location     ?? null,
          p_avatar_url:   p.avatar_url   ?? null,
          p_linkedin_url: p.linkedin_url ?? null,
          p_twitter_url:  p.twitter_url  ?? null,
          p_user_type:    p.user_type    ?? "founder",
          p_resume_url:   p.resume_url   ?? null,
        },
      );

      if (!rpcError) {
        const result = rpcData as { ok?: boolean; error?: string } | null;
        if (result?.ok === false) {
          return { ok: false, error: result.error ?? "upsert_own_profile returned ok=false" };
        }
        await fetchProfile();
        return { ok: true };
      }

      // ── Path 3: Edge function (if complete-founder-onboarding is deployed) ────────
      const edgeResult = await completeFounderOnboardingEdge({
        userId: user.id,
        profile: {
          full_name:                p.full_name     ?? undefined,
          title:                    p.title         ?? undefined,
          bio:                      p.bio           ?? undefined,
          location:                 p.location      ?? undefined,
          avatar_url:               p.avatar_url    ?? undefined,
          linkedin_url:             p.linkedin_url  ?? undefined,
          twitter_url:              p.twitter_url   ?? undefined,
          user_type:                p.user_type     ?? undefined,
          has_completed_onboarding: p.has_completed_onboarding ?? true,
          has_seen_settings_tour:   p.has_seen_settings_tour   ?? undefined,
          company_id:               p.company_id    ?? undefined,
        },
      });

      if (edgeResult.ok) {
        await fetchProfile();
        return { ok: true };
      }

      return { ok: false, error: `Profile save unavailable. All paths failed. Last error: ${edgeResult.error}` };
    },
    [user, fetchProfile],
  );

  return { profile, loading, upsertProfile, refetch: fetchProfile };
}

/** Fetch founder profiles from the people table (YC founders + repeat founders) */
export function useFounderProfiles() {
  const [founders, setFounders] = useState<FounderProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Step 1: get founder/ceo role → person + org in one join
        // Uses supabasePublicDirectory (anon only — Clerk JWT would cause PGRST301 on these reads);
        // the main supabase client's accessToken getter fails in dev, which blocks these reads.
        const { data: roles, error: rolesError } = await (supabasePublicDirectory as any)
          .from("roles")
          .select(`
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
          `)
          .in("roleType", ["founder", "cofounder", "ceo"])
          .eq("isCurrent", true)
          .not("person", "is", null)
          .limit(500);

        if (rolesError || !roles || roles.length === 0) {
          console.warn("Failed to fetch founder roles:", rolesError);
          setFounders([]);
          return;
        }

        // Deduplicate by person id — keep first role found per person
        const seen = new Set<string>();
        const result: FounderProfile[] = [];

        for (const r of roles as any[]) {
          const p = r.person;
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          const org = r.organization;
          result.push({
            id: p.id,
            user_id: p.id,
            full_name: p.canonicalName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
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

        setFounders(result);
      } catch (err) {
        console.warn("Error loading founder profiles:", err);
        setFounders([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { founders, loading };
}

export interface CompanyProfile {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  logo_url: string | null;
  founded_year: number | null;
  is_yc_backed: boolean;
  yc_batch: string | null;
  employee_count: number | null;
  /** DB: fundingStatus — bootstrapped, vc_backed, unknown, etc. */
  funding_status: string | null;
  /** DB: vcBacked — explicit VC equity; null = unknown. */
  vc_backed: boolean | null;
  /** DB: investmentStage — Pre-seed, Seed, Series A (not YC cohort). */
  investment_stage: string | null;
}

/** Fetch company profiles from organizations / yc_companies */
export function useCompanyDirectory(limit = 300) {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabasePublicDirectory as any)
          .from("organizations")
          .select(`
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
          `)
          .not("description", "is", null)
          .eq("ready_for_live", true)
          .limit(limit);

        if (error || !data) {
          console.warn("Failed to fetch company profiles:", error);
          setCompanies([]);
          return;
        }

        setCompanies((data as any[]).map((o) => ({
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
        })));
      } catch (err) {
        console.warn("Error loading company profiles:", err);
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [limit]);

  return { companies, loading };
}

export interface OperatorProfile {
  id: string;
  full_name: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  engagement_type: string | null;
  sector_focus: string[] | null;
  stage_focus: string | null;
  expertise: string[] | null;
  prior_companies: string[] | null;
  /** Enriched from roles → organizations (see backfill-operator-profiles-directory-fields). */
  current_company_name?: string | null;
  is_available: boolean;
}

/** Fetch operator profiles from operator_profiles table */
export function useOperatorProfiles(limit = 200) {
  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabasePublicDirectory as any)
          .from("operator_profiles")
          .select(
            "id, full_name, title, bio, avatar_url, linkedin_url, x_url, city, state, country, engagement_type, sector_focus, stage_focus, expertise, prior_companies, is_available",
          )
          .is("deleted_at", null)
          .eq("is_available", true)
          .eq("ready_for_live", true)
          .limit(limit);

        if (error || !data) {
          console.warn("Failed to fetch operator profiles:", error);
          setOperators([]);
          return;
        }

        setOperators(data as OperatorProfile[]);
      } catch (err) {
        console.warn("Error loading operator profiles:", err);
        setOperators([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [limit]);

  return { operators, loading };
}
