import { useCallback, useEffect, useState } from "react";
import { supabase, getSupabaseAccessToken } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface DeckShare {
  id: string;
  deck_id: string;
  token: string;
  recipient_name: string;
  recipient_firm: string | null;
  recipient_email: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/** One open of a shared deck, flattened with the recipient it belongs to. */
export interface ShareViewEvent {
  id: string;
  shareId: string;
  viewedAt: string;
  recipientName: string;
  recipientFirm: string | null;
  fileName: string;
}

interface ShareViewRow {
  id: string;
  share_id: string;
  viewed_at: string;
  deck_shares: {
    recipient_name: string;
    recipient_firm: string | null;
    company_pitch_decks: { file_name: string } | null;
  } | null;
}

function parseJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function useDeckShares() {
  const { user } = useAuth();
  const [shares, setShares] = useState<DeckShare[]>([]);
  const [views, setViews] = useState<ShareViewEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const resolveRlsUserId = useCallback(async (): Promise<string | null> => {
    const token = await getSupabaseAccessToken();
    return parseJwtSub(token) ?? user?.id ?? null;
  }, [user?.id]);

  const refetch = useCallback(async () => {
    try {
      const rlsUserId = await resolveRlsUserId();
      if (!rlsUserId) {
        setLoading(false);
        return;
      }

      // RLS already scopes views to shares this user owns, so the view query
      // needs no user filter of its own.
      const [sharesRes, viewsRes] = await Promise.all([
        supabase
          .from("deck_shares" as any)
          .select("*")
          .eq("user_id", rlsUserId)
          .order("created_at", { ascending: false }),
        supabase
          .from("deck_share_views" as any)
          .select("id, share_id, viewed_at, deck_shares(recipient_name, recipient_firm, company_pitch_decks(file_name))")
          .order("viewed_at", { ascending: false })
          .limit(50),
      ]);

      if (sharesRes.error) throw sharesRes.error;
      if (viewsRes.error) throw viewsRes.error;

      setShares((sharesRes.data || []) as unknown as DeckShare[]);
      setViews(
        ((viewsRes.data || []) as unknown as ShareViewRow[]).map((row) => ({
          id: row.id,
          shareId: row.share_id,
          viewedAt: row.viewed_at,
          recipientName: row.deck_shares?.recipient_name ?? "Unknown",
          recipientFirm: row.deck_shares?.recipient_firm ?? null,
          fileName: row.deck_shares?.company_pitch_decks?.file_name ?? "Pitch deck",
        })),
      );
    } catch (err) {
      console.error("Failed to load deck shares:", err);
    } finally {
      setLoading(false);
    }
  }, [resolveRlsUserId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createShare = useCallback(
    async (input: {
      deckId: string;
      recipientName: string;
      recipientFirm?: string;
      recipientEmail?: string;
    }): Promise<DeckShare | null> => {
      try {
        const rlsUserId = await resolveRlsUserId();
        if (!rlsUserId) throw new Error("Not authenticated");

        const { data, error } = await supabase
          .from("deck_shares" as any)
          .insert({
            user_id: rlsUserId,
            deck_id: input.deckId,
            recipient_name: input.recipientName.trim(),
            recipient_firm: input.recipientFirm?.trim() || null,
            recipient_email: input.recipientEmail?.trim() || null,
          })
          .select("*")
          .single();

        if (error) throw error;

        const share = data as unknown as DeckShare;
        setShares((prev) => [share, ...prev]);
        return share;
      } catch (err) {
        console.error("Failed to create share link:", err);
        toast({
          title: "Could not create share link",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
        return null;
      }
    },
    [resolveRlsUserId],
  );

  const revokeShare = useCallback(async (shareId: string) => {
    const revokedAt = new Date().toISOString();
    const { error } = await supabase
      .from("deck_shares" as any)
      .update({ revoked_at: revokedAt })
      .eq("id", shareId);

    if (error) {
      toast({ title: "Could not revoke link", description: error.message, variant: "destructive" });
      return;
    }
    setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, revoked_at: revokedAt } : s)));
  }, []);

  return { shares, views, loading, createShare, revokeShare, refetch };
}

/** Absolute link a recipient can open. */
export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}
