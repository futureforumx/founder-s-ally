import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface TrackedCompetitor {
  id: string; // company_competitors.id
  competitor_id: string;
  status: "Tracked" | "Threat" | "Watch";
  user_defined_advantage: string | null;
  competitor: {
    id: string;
    name: string;
    website: string | null;
    description: string | null;
    industry_tags: string[];
    logo_url: string | null;
    funding: string | null;
    stage: string | null;
    employee_count: string | null;
  };
}

export interface CompetitorRecommendation {
  competitor_id: string;
  competitor_name: string;
  website: string | null;
  description: string | null;
  industry_tags: string[];
  tracking_count: number;
  tag_overlap: number;
}

export function useCompetitors() {
  const { user } = useAuth();
  const [competitors, setCompetitors] = useState<TrackedCompetitor[]>([]);
  const [recommendations, setRecommendations] = useState<CompetitorRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchCompetitors = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-competitors", {
        body: { action: "list" },
      });
      if (error) throw error;
      setCompetitors(data.competitors || []);
    } catch (e) {
      console.error("Failed to fetch competitors:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCompetitor = useCallback(async (name: string, status: string = "Tracked", notes?: string, website?: string) => {
    // Check if user is logged in
    if (!user) {
      toast.error("You must be logged in to add competitors");
      return null;
    }

    // Optimistic: add a placeholder
    const tempId = `temp-${Date.now()}`;
    const optimistic: TrackedCompetitor = {
      id: tempId,
      competitor_id: tempId,
      status: status as any,
      user_defined_advantage: null,
      competitor: {
        id: tempId,
        name,
        website: website || `https://${name.toLowerCase().replace(/\s+/g, "")}.com`,
        description: null,
        industry_tags: [],
        logo_url: null,
        funding: null,
        stage: null,
        employee_count: null,
      },
    };
    setCompetitors(prev => [optimistic, ...prev]);
    setAdding(true);

    try {
      if (!name?.trim()) {
        throw new Error("Competitor name is required");
      }

      const trimmedName = name.trim();
      const competitorWebsite = website || `https://${trimmedName.toLowerCase().replace(/\s+/g, "")}.com`;
      const validStatus = ["Tracked", "Threat", "Watch"].includes(status) ? status : "Tracked";

      // Step 1: Check if competitor exists globally
      const { data: existing } = await supabase
        .from("competitors")
        .select("id")
        .ilike("name", trimmedName)
        .single();

      let competitorId: string;

      if (existing) {
        competitorId = existing.id;
      } else {
        // Step 2: Create new global competitor entry with basic info
        const { data: newComp, error: insertErr } = await supabase
          .from("competitors")
          .insert({
            name: trimmedName,
            website: competitorWebsite,
            description: `${trimmedName} operates in the market.`,
            industry_tags: [],
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        competitorId = newComp.id;
      }

      // Step 3: Link competitor to user
      const { data: link, error: linkErr } = await supabase
        .from("company_competitors")
        .insert({
          user_id: user.id,
          competitor_id: competitorId,
          status: validStatus,
          user_defined_advantage: null,
          notes: notes || null,
        })
        .select("*, competitor:competitors(*)")
        .single();

      if (linkErr) {
        if (linkErr.code === "23505") {
          // Remove optimistic entry
          setCompetitors(prev => prev.filter(c => c.id !== tempId));
          toast.error("Competitor already tracked");
          return null;
        }
        throw linkErr;
      }

      // Replace optimistic with real
      setCompetitors(prev => prev.map(c => c.id === tempId ? link : c));
      toast.success(`${name} added to tracked competitors`);
      return link;
    } catch (e) {
      setCompetitors(prev => prev.filter(c => c.id !== tempId));
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("Failed to add competitor:", errorMsg, e);
      toast.error("Failed to add competitor");
      return null;
    } finally {
      setAdding(false);
    }
  }, [user]);

  const updateStatus = useCallback(async (compCompId: string, status: string) => {
    // Optimistic update
    setCompetitors(prev => prev.map(c => c.id === compCompId ? { ...c, status: status as any } : c));
    try {
      const { data, error } = await supabase.functions.invoke("manage-competitors", {
        body: { action: "update_status", company_competitor_id: compCompId, status },
      });
      if (error) throw error;
      setCompetitors(prev => prev.map(c => c.id === compCompId ? data.competitor : c));
    } catch (e) {
      console.error("Failed to update status:", e);
      fetchCompetitors(); // rollback
    }
  }, [fetchCompetitors]);

  const removeCompetitor = useCallback(async (compCompId: string) => {
    const removed = competitors.find(c => c.id === compCompId);
    setCompetitors(prev => prev.filter(c => c.id !== compCompId));
    try {
      const { error } = await supabase.functions.invoke("manage-competitors", {
        body: { action: "remove", company_competitor_id: compCompId },
      });
      if (error) throw error;
      toast.success("Competitor removed");
    } catch (e) {
      if (removed) setCompetitors(prev => [...prev, removed]);
      toast.error("Failed to remove competitor");
    }
  }, [competitors]);

  const fetchRecommendations = useCallback(async (industryTags: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-competitors", {
        body: { action: "recommend", industry_tags: industryTags },
      });
      if (error) throw error;
      setRecommendations(data.recommendations || []);
    } catch (e) {
      console.error("Failed to fetch recommendations:", e);
    }
  }, []);

  const searchCompetitors = useCallback(async (query: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-competitors", {
        body: { action: "search", query },
      });
      if (error) throw error;
      return data.results || [];
    } catch (e) {
      console.error("Search failed:", e);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  return {
    competitors,
    recommendations,
    loading,
    adding,
    addCompetitor,
    updateStatus,
    removeCompetitor,
    fetchRecommendations,
    searchCompetitors,
    refetch: fetchCompetitors,
  };
}
