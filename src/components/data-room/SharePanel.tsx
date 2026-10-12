import { useState } from "react";
import { Share2, Copy, Check, Eye, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { usePitchDecks } from "@/hooks/usePitchDecks";
import { useDeckShares, shareUrl } from "@/hooks/useDeckShares";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function SharePanel() {
  const { decks, activeDeck, loading: decksLoading } = usePitchDecks();
  const { shares, views, loading, createShare, revokeShare } = useDeckShares();
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const deck = activeDeck ?? decks[0] ?? null;
  const viewsByShare = views.reduce<Record<string, number>>((acc, v) => {
    acc[v.shareId] = (acc[v.shareId] ?? 0) + 1;
    return acc;
  }, {});

  const handleCreate = async () => {
    if (!deck || !name.trim()) return;
    setCreating(true);
    const share = await createShare({ deckId: deck.id, recipientName: name, recipientFirm: firm });
    setCreating(false);
    if (!share) return;

    setName("");
    setFirm("");
    await copyLink(share.token);
    toast({ title: "Share link created", description: "Copied to your clipboard." });
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Create a link per investor so you can see exactly who opened your deck.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Share2 className="h-3.5 w-3.5 text-accent" /> New Share Link
        </h3>

        {decksLoading ? (
          <p className="text-xs text-muted-foreground">Loading your deck…</p>
        ) : !deck ? (
          <p className="text-xs text-muted-foreground">
            Upload a pitch deck in the Files tab first — a share link needs something to point at.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Investor Name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div>
                <FieldLabel>Firm</FieldLabel>
                <Input
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="Index Ventures"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="truncate text-[11px] text-muted-foreground">Sharing {deck.file_name}</p>
              <Button size="sm" onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Create link
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active Links
        </h3>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="text-xs text-muted-foreground">No share links yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {shares.map((share) => {
              const count = viewsByShare[share.id] ?? 0;
              const lastView = views.find((v) => v.shareId === share.id);
              return (
                <div key={share.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {share.recipient_name}
                      {share.recipient_firm ? (
                        <span className="font-normal text-muted-foreground"> · {share.recipient_firm}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      {count === 0
                        ? "Not opened yet"
                        : `${count} view${count === 1 ? "" : "s"}${lastView ? ` · last ${relativeTime(lastView.viewedAt)}` : ""}`}
                      {share.revoked_at ? " · revoked" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!share.revoked_at && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => copyLink(share.token)}
                        >
                          {copiedToken === share.token ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => revokeShare(share.id)}
                          title="Revoke link"
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SharePanel;
