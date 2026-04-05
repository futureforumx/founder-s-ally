import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  normalizeProfileRowForRead,
  normalizeProfileRowsForRead,
} from "@/lib/profileRead"; // full-row reads: profiles table + normalization (see module doc there)

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
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
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
      try {
        const payload = { ...updates, user_id: user.id, updated_at: new Date().toISOString() };

        if (profile) {
          const { error } = await (supabase as any)
            .from("profiles")
            .update(payload)
            .eq("user_id", user.id);
          if (error) {
            console.warn("Failed to update profile:", error);
            return { ok: false, error: error.message };
          }
        } else {
          const { error } = await (supabase as any).from("profiles").insert(payload);
          if (error) {
            console.warn("Failed to insert profile:", error);
            return { ok: false, error: error.message };
          }
        }
        await fetchProfile();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("Error upserting profile:", err);
        return { ok: false, error: msg };
      }
    },
    [user, profile, fetchProfile],
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
        // Uses supabaseVcDirectory (anon key only) — roles/people/organizations have no RLS;
        // the main supabase client's accessToken getter fails in dev, which blocks these reads.
        const { data: roles, error: rolesError } = await (supabaseVcDirectory as any)
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
}

/** Fetch company profiles from organizations / yc_companies */
export function useCompanyDirectory(limit = 300) {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabaseVcDirectory as any)
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
            "employeeCount"
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
        const { data, error } = await (supabaseVcDirectory as any)
          .from("operator_profiles")
          .select("id, full_name, title, bio, avatar_url, linkedin_url, x_url, city, state, country, engagement_type, sector_focus, stage_focus, expertise, prior_companies, is_available")
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
