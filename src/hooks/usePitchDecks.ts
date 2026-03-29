import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface PitchDeck {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  is_active: boolean;
  file_size_bytes: number | null;
  slide_count: number | null;
}

interface UploadDeckOptions {
  silent?: boolean;
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

export function usePitchDecks() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<PitchDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDeck, setActiveDeck] = useState<PitchDeck | null>(null);

  const resolveRlsUserId = useCallback(async (): Promise<string | null> => {
    const token = await getSupabaseAccessToken();
    const jwtSub = parseJwtSub(token);
    return jwtSub ?? user?.id ?? null;
  }, [user?.id]);

  const fetchDecks = useCallback(async () => {
    try {
      const rlsUserId = await resolveRlsUserId();
      if (!rlsUserId) return;

      const { data, error } = await supabase
        .from("company_pitch_decks" as any)
        .select("*")
        .eq("user_id", rlsUserId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as unknown as PitchDeck[];
      setDecks(rows);
      setActiveDeck(rows.find(d => d.is_active) || null);
    } catch (err) {
      console.error("Failed to fetch pitch decks:", err);
    } finally {
      setLoading(false);
    }
  }, [resolveRlsUserId]);

  useEffect(() => { fetchDecks(); }, [fetchDecks]);

  const uploadDeck = useCallback(async (file: File, options?: UploadDeckOptions): Promise<PitchDeck | null> => {
    try {
      const rlsUserId = await resolveRlsUserId();
      if (!rlsUserId) throw new Error("Not authenticated");

      // Upload file to storage
      const filePath = `${rlsUserId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("pitch-decks")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get the file URL
      const { data: urlData } = supabase.storage
        .from("pitch-decks")
        .getPublicUrl(filePath);

      // Insert record (trigger auto-deactivates others)
      const { data, error } = await supabase
        .from("company_pitch_decks" as any)
        .insert({
          user_id: rlsUserId,
          file_name: file.name,
          file_url: filePath,
          is_active: true,
          file_size_bytes: file.size,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const newDeck = data as unknown as PitchDeck;
      await fetchDecks();

      toast({ title: "Deck uploaded", description: `${file.name} is now the active deck.` });
      return newDeck;
    } catch (err) {
      console.error("Upload failed:", err);
      if (!options?.silent) {
        toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
      }
      return null;
    }
  }, [fetchDecks, resolveRlsUserId]);

  const makeActive = useCallback(async (deckId: string) => {
    try {
      const { error } = await supabase
        .from("company_pitch_decks" as any)
        .update({ is_active: true } as any)
        .eq("id", deckId);

      if (error) throw error;
      await fetchDecks();
      toast({ title: "Active deck updated" });
    } catch (err) {
      console.error("Failed to set active:", err);
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }, [fetchDecks]);

  const deleteDeck = useCallback(async (deckId: string) => {
    try {
      const deck = decks.find(d => d.id === deckId);
      if (deck) {
        await supabase.storage.from("pitch-decks").remove([deck.file_url]);
      }

      const { error } = await supabase
        .from("company_pitch_decks" as any)
        .delete()
        .eq("id", deckId);

      if (error) throw error;
      await fetchDecks();
      toast({ title: "Deck removed" });
    } catch (err) {
      console.error("Failed to delete:", err);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }, [fetchDecks, decks]);

  const getDownloadUrl = useCallback(async (fileUrl: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("pitch-decks")
        .createSignedUrl(fileUrl, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch {
      return null;
    }
  }, []);

  return { decks, activeDeck, loading, uploadDeck, makeActive, deleteDeck, getDownloadUrl, refetch: fetchDecks };
}
