import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { usePitchDecks } from "@/hooks/usePitchDecks";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Activity = { id: string; viewedAt: string; viewer: string; linkName: string; intendedInvestorName: string | null; fileName: string };
type AnalyticsResponse = { error?: string; links?: Array<{ id: string; name: string; intendedInvestorName?: string | null; lastActivityAt?: string | null; verifiedIdentities?: Array<{ email: string }>; submittedIdentities?: Array<{ email: string }> }> };

/** Recent link activity only uses sessions that rendered a visible PDF slide. */
export function RecentActivityPanel() {
  const { decks, activeDeck, loading: decksLoading } = usePitchDecks();
  const deck = activeDeck ?? decks[0] ?? null;
  const deckId = deck?.id;
  const fileName = deck?.file_name ?? "Pitch deck";
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!deckId) { setItems([]); return; }
    setLoading(true);
    (async () => {
      try {
        const token = await getSupabaseAccessToken();
        const response = await fetch(`/api/deck-share-analytics?deckId=${encodeURIComponent(deckId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const result = await response.json().catch(() => ({})) as AnalyticsResponse;
        if (!response.ok) throw new Error(result.error || "Analytics unavailable");
        const activity: Activity[] = (result.links ?? []).flatMap((link) => link.lastActivityAt ? [{
          id: link.id, viewedAt: link.lastActivityAt, viewer: link.verifiedIdentities?.[0]?.email || (link.submittedIdentities?.[0]?.email ? `${link.submittedIdentities[0].email} · submitted` : "Anonymous viewer"),
          linkName: link.name, intendedInvestorName: link.intendedInvestorName || null, fileName,
        }] : []);
        activity.sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt));
        if (!cancelled) { setItems(activity.slice(0, 8)); setAvailable(true); }
      } catch { if (!cancelled) { setAvailable(false); setItems([]); } }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [deckId, fileName]);

  return <div className="flex min-w-0 flex-col gap-5">
    <div className="flex items-baseline justify-between gap-4"><h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Recent activity</h3><p className="text-[13px] leading-[18px] text-muted-foreground">Native deck views</p></div>
    {decksLoading || loading ? <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading recent views…</p> : !available ? <p className="text-[13px] leading-[18px] text-muted-foreground">Recent deck activity is unavailable right now. Open Analytics to retry.</p> : items.length === 0 ? <p className="text-[13px] leading-[18px] text-muted-foreground">No deck views yet. Activity appears after the first slide is rendered.</p> : <div>{items.map((item) => <div key={item.id} className="flex items-center gap-4 border-b border-border py-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted"><Eye className="h-3.5 w-3.5 text-muted-foreground" /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium leading-5 text-foreground">{item.viewer}</p><p className="mt-1 truncate text-[13px] leading-[18px] text-muted-foreground">{item.linkName} · {item.fileName}{item.intendedInvestorName ? ` · intended for ${item.intendedInvestorName}` : ""}</p></div>
      <span className="w-16 shrink-0 text-right text-[13px] leading-[18px] tabular-nums text-muted-foreground">{relativeTime(item.viewedAt)}</span>
    </div>)}</div>}
  </div>;
}

export default RecentActivityPanel;
