import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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

/** Fetch all public founder profiles with their company data */
export function useFounderProfiles() {
  const [founders, setFounders] = useState<FounderProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch public founder profiles
        const { data: profiles, error: profileError } = await (supabase as any)
          .from("profiles")
          .select("*")
          .eq("user_type", "founder")
          .eq("is_public", true);

        if (profileError || !profiles || profiles.length === 0) {
          console.warn("Failed to fetch founder profiles:", profileError);
          setFounders([]);
          return;
        }

        const companyIds = (profiles as any[])
          .map((p) => p.company_id)
          .filter(Boolean);

        const companyMap = new Map<string, any>();
        if (companyIds.length > 0) {
          const { data: companies } = await supabase
            .from("company_analyses")
            .select("id, company_name, sector, stage, competitors")
            .in("id", companyIds);
          if (companies) {
            for (const c of companies) companyMap.set(c.id, c);
          }
        }

        const normalized = normalizeProfileRowsForRead(profiles as Record<string, unknown>[]);
        const result: FounderProfile[] = normalized.map((p) => ({
          ...p,
          company_name: p.company_id ? companyMap.get(p.company_id)?.company_name || null : null,
          company_sector: p.company_id ? companyMap.get(p.company_id)?.sector || null : null,
          company_stage: p.company_id ? companyMap.get(p.company_id)?.stage || null : null,
          company_competitors: p.company_id ? companyMap.get(p.company_id)?.competitors || null : null,
        }));

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
