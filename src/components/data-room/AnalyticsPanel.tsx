import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Flame, HelpCircle, Info, Loader2, Mail, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { usePitchDecks } from "@/hooks/usePitchDecks";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  buildDeckAnalyticsDashboard,
  deckVersionLabel,
  deckVersionNumber,
  formatCompletionRate,
  formatDuration,
  formatRelativeTime,
  shareLinkUrl,
  slidesProgressLabel,
  type DeckAnalyticsDashboard,
  type DiligenceSignal,
  type LinkActivityRow,
  type SlideDwellMetric,
  type SlideQuestionItem,
} from "@/components/data-room/deckAnalyticsModel";

type AnalyticsSection = "analytics" | "audit";

interface ShareLinkRecord {
  id: string;
  company_slug?: string | null;
  presentation_slug?: string | null;
  token?: string | null;
}

const SIGNAL_LABEL: Record<DiligenceSignal, string> = {
  likely_forwarded: "Likely forwarded",
  high_conviction: "High conviction",
  quick_dropoff: "Quick drop-off",
};

const SIGNAL_CLASS: Record<DiligenceSignal, string> = {
  likely_forwarded: "border-success/40 text-success",
  high_conviction: "border-border text-foreground",
  quick_dropoff: "border-amber-500/40 text-amber-600 dark:text-amber-400",
};

const CARD_CLASS = "rounded-xl border border-border bg-card";
const PILL_BUTTON_CLASS =
  "h-9 rounded-full border-border bg-card text-foreground shadow-none hover:bg-secondary";

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
        >
          {label.startsWith("Session") ? <HelpCircle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

function Metric({ label, value, caption, tip, tipLabel }: { label: string; value: string; caption: string; tip?: string; tipLabel?: string }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 p-5 shadow-[inset_-1px_0_0_hsl(var(--border)),inset_0_-1px_0_hsl(var(--border))]">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span className="truncate">{label}</span>
        {tip && <InfoTip label={tipLabel || label}>{tip}</InfoTip>}
      </div>
      <p className="truncate text-[32px] font-semibold leading-9 tracking-[-0.04em] tabular-nums text-foreground">{value}</p>
      <p className="truncate text-xs text-muted-foreground/80">{caption}</p>
    </article>
  );
}

function CountBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border px-2 font-mono text-xs tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

async function fetchAnalytics(deckId: string): Promise<unknown> {
  const token = await getSupabaseAccessToken();
  const response = await fetch(`/api/deck-share-analytics?deckId=${encodeURIComponent(deckId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Deck analytics are unavailable.");
  return data;
}

async function fetchShareLinks(): Promise<ShareLinkRecord[]> {
  try {
    const token = await getSupabaseAccessToken();
    const response = await fetch("/api/deck-shares", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.links)) return [];
    return data.links as ShareLinkRecord[];
  } catch {
    return [];
  }
}

function SlideRow({ slide, maxAverage }: { slide: SlideDwellMetric; maxAverage: number }) {
  const width = maxAverage > 0 ? Math.min(100, (slide.averageSeconds / maxAverage) * 100) : 0;
  const visibleWidth = slide.averageSeconds > 0 ? Math.max(width, 3) : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="grid cursor-default grid-cols-[1.75rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-mono text-xs tabular-nums text-muted-foreground/80">{String(slide.slideNumber).padStart(2, "0")}</span>
          <p className="truncate text-sm font-medium text-foreground">{slide.title || `Slide ${slide.slideNumber}`}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", slide.isHotspot ? "bg-foreground" : "bg-muted-foreground/45")}
              style={{ width: `${visibleWidth}%` }}
            />
          </div>
          <div className="flex min-w-[6rem] items-center justify-end gap-2">
            {slide.isHighDropOff && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="High drop-off" />
            )}
            {slide.isHotspot && (
              <span className="hidden h-5 items-center gap-1 rounded-full border border-border px-1.5 text-[11px] font-medium text-foreground/90 sm:inline-flex">
                <Flame className="h-3 w-3" aria-hidden="true" />
                Hot
              </span>
            )}
            <span className="w-10 text-right text-[13px] tabular-nums text-foreground">{formatDuration(slide.averageSeconds)}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-left text-xs leading-relaxed">
        <p>{slide.viewCount} {slide.viewCount === 1 ? "view" : "views"}</p>
        <p>Avg. {formatDuration(slide.averageSeconds)}</p>
        <p>Drop-off {slide.dropOffRate == null ? "—" : `${slide.dropOffRate}%`}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function LinkActivitySection({
  links,
  copiedId,
  onCopy,
  onCreateLink,
}: {
  links: LinkActivityRow[];
  copiedId: string;
  onCopy: (id: string, url: string) => void;
  onCreateLink?: () => void;
}) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em]">Link activity</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">Views, time and follow-through for each sharing link.</p>
        </div>
        {links.length > 0 && onCreateLink && (
          <Button type="button" size="sm" className="h-9 rounded-full" onClick={onCreateLink}>
            <Plus />
            New link
          </Button>
        )}
      </div>
      {links.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No sharing links yet</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">Create a link for this version to start tracking who opens it.</p>
          <Button type="button" className="mt-1 rounded-full" onClick={onCreateLink}>
            <Plus />
            Create first link
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {[
                  { label: "Recipient", align: "pl-5 sm:pl-6" },
                  { label: "Link", align: "" },
                  { label: "Views", align: "text-right" },
                  { label: "Avg. time", align: "text-right" },
                  { label: "Completion", align: "" },
                  { label: "Questions", align: "text-right" },
                  { label: "Last active", align: "" },
                  { label: "Signal", align: "pr-5 sm:pr-6" },
                ].map((heading) => (
                  <th key={heading.label} scope="col" className={cn("px-4 py-3 font-medium", heading.align)}>{heading.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40">
                  <td className="py-3.5 pl-5 pr-4 sm:pl-6">
                    <p className="font-medium text-foreground">{link.recipientLabel}</p>
                    {link.status !== "active" && (
                      <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{link.status}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {link.url ? (
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[12rem] truncate font-mono text-[11px] text-muted-foreground" title={link.url}>{link.url}</span>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Copy link for ${link.recipientLabel}`}
                          onClick={() => onCopy(link.id, link.url)}
                        >
                          {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{link.views}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatDuration(link.averageSeconds)}</td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-xs tabular-nums text-foreground/90">
                      {slidesProgressLabel(link.slidesViewed, link.slideCount)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{link.questions}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{formatRelativeTime(link.lastActiveAt)}</td>
                  <td className="py-3.5 pl-4 pr-5 sm:pr-6">
                    {link.signal ? (
                      <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium", SIGNAL_CLASS[link.signal])}>
                        {SIGNAL_LABEL[link.signal]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AnalyticsPanel({ onCreateLink }: { onCreateLink?: (deckId: string) => void }) {
  const { decks, loading: decksLoading } = usePitchDecks();
  const [section, setSection] = useState<AnalyticsSection>("analytics");
  const [deckId, setDeckId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboard, setDashboard] = useState<DeckAnalyticsDashboard | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!decks.length) return;
    setDeckId((current) => (
      decks.some((deck) => deck.id === current) ? current : (decks.find((deck) => deck.is_active) ?? decks[0]).id
    ));
  }, [decks]);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const [analytics, shares] = await Promise.all([fetchAnalytics(deckId), fetchShareLinks()]);
        if (cancelled) return;
        const urls = Object.fromEntries(shares.map((link) => [
          link.id,
          shareLinkUrl(window.location.origin, link.company_slug, link.presentation_slug, link.token),
        ]));
        setDashboard(buildDeckAnalyticsDashboard(analytics, urls));
        setLoadedFor(deckId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Deck analytics are unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deckId, refreshKey]);

  const selectedDeck = decks.find((deck) => deck.id === deckId) ?? null;
  const visible = dashboard && loadedFor === deckId ? dashboard : null;
  const versionDecks = useMemo(
    () => decks.map((deck) => ({ id: deck.id, uploadedAt: deck.uploaded_at })),
    [decks],
  );
  const hasDwell = visible?.slides.some((slide) => slide.viewCount > 0 || slide.averageSeconds > 0) ?? false;
  const maxAverage = visible ? Math.max(...visible.slides.map((slide) => slide.averageSeconds), 0) : 0;

  const copyLink = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? "" : current)), 1800);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const replyToQuestion = (question: SlideQuestionItem) => {
    if (!question.viewerEmail) return;
    const subject = encodeURIComponent(`Re: Slide ${question.slideNumber} question`);
    const body = encodeURIComponent(question.body);
    window.location.href = `mailto:${question.viewerEmail}?subject=${subject}&body=${body}`;
  };

  const sections: Array<{ id: AnalyticsSection; label: string }> = [
    { id: "analytics", label: "Analytics" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <section className="space-y-8 text-foreground" aria-busy={loading}>
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">{section === "audit" ? "Audit log" : "Deck analytics"}</h2>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {section === "audit"
              ? "Sharing links for this deck version, and what each one did."
              : "Engagement and diligence signals across active links."}
            {visible && section === "analytics" && (
              <InfoTip label="Session tracking definitions">{visible.definitions.sessions}</InfoTip>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Deck analytics sections" className="flex gap-0.5 rounded-full border border-border bg-card p-[3px]">
            {sections.map((item) => {
              const selected = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`deck-analytics-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`deck-analytics-panel-${item.id}`}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "h-[30px] rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {decks.length > 0 && selectedDeck && (
            <Select value={selectedDeck.id} onValueChange={setDeckId}>
              <SelectTrigger aria-label="Deck version" className="h-9 w-[min(100%,17rem)] rounded-md border-border bg-card px-4 text-[13px] font-medium text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deckVersionLabel(deck.file_name, deckVersionNumber(versionDecks, deck.id), deck.is_active)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Refresh analytics"
                onClick={() => setRefreshKey((current) => current + 1)}
                disabled={loading || !selectedDeck}
                className={cn(PILL_BUTTON_CLASS, "w-9")}
              >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {decksLoading && !selectedDeck && <p className="text-sm text-muted-foreground">Loading deck versions…</p>}
      {!decksLoading && !selectedDeck && (
        <div className={cn(CARD_CLASS, "px-6 py-10 text-center text-sm text-muted-foreground")}>
          Upload a pitch deck to view engagement.
        </div>
      )}

      {selectedDeck && !visible && loading && section === "analytics" && (
        <div className={cn(CARD_CLASS, "grid h-[132px] animate-pulse grid-cols-2 overflow-hidden md:grid-cols-5")} aria-hidden="true" />
      )}
      {selectedDeck && !visible && loading && section === "audit" && (
        <div className={cn(CARD_CLASS, "h-48 animate-pulse")} aria-hidden="true" />
      )}

      {visible && section === "analytics" && (
        <div role="tabpanel" id="deck-analytics-panel-analytics" aria-labelledby="deck-analytics-tab-analytics" className="space-y-5">
          <div className={cn(CARD_CLASS, "grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] overflow-hidden")}>
            <Metric
              label="Total views"
              value={String(visible.summary.totalViews)}
              caption="Started viewer sessions"
              tip={visible.definitions.views}
              tipLabel="How views are counted"
            />
            <Metric label="Unique visitors" value={String(visible.summary.uniqueVisitors)} caption="Distinct browsers" />
            <Metric
              label="Avg. viewing time"
              value={formatDuration(visible.summary.averageViewingSeconds)}
              caption="Active, visible time"
              tip={visible.definitions.viewingTime}
              tipLabel="How viewing time is calculated"
            />
            <Metric
              label="Completion rate"
              value={formatCompletionRate(visible.summary.completionRate)}
              caption={visible.summary.completionRate == null ? "Page count unknown" : "Sessions that saw every slide"}
              tip={visible.definitions.completion}
              tipLabel="How completion is calculated"
            />
            <Metric label="Inbound questions" value={String(visible.summary.inboundQuestions)} caption="Sent from slides" />
          </div>

          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,1fr)]">
            <section className={cn(CARD_CLASS, "flex min-w-0 flex-col")}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em]">Slide-by-slide dwell</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">Average active time on each slide.</p>
                </div>
                {hasDwell && (
                  <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground" aria-label="Chart legend">
                    <li className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-full bg-foreground" aria-hidden="true" />Top 2 slides</li>
                    <li className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-full bg-muted-foreground/45" aria-hidden="true" />Other</li>
                    <li className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />&gt;40% drop-off</li>
                  </ul>
                )}
              </div>
              {hasDwell ? (
                <div className="max-h-[28rem] overflow-y-auto px-3 py-2">
                  {visible.slides.map((slide) => (
                    <SlideRow key={slide.slideNumber} slide={slide} maxAverage={maxAverage} />
                  ))}
                </div>
              ) : (
                <p className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
                  Slide timing shows up after someone opens this version.
                </p>
              )}
            </section>

            <section className={cn(CARD_CLASS, "flex min-w-0 flex-col")}>
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em]">Questions &amp; feedback</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">Sent from individual slides.</p>
                </div>
                <CountBadge value={visible.questions.length} />
              </div>
              {visible.questions.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground" aria-hidden="true">
                    <MessageSquare className="h-[18px] w-[18px]" />
                  </span>
                  <p className="text-sm font-medium text-foreground">No questions yet</p>
                  <p className="max-w-[16rem] text-[13px] text-muted-foreground">
                    When an investor asks something from a slide, it lands here with the slide it came from.
                  </p>
                </div>
              ) : (
                <ul className="max-h-[28rem] overflow-y-auto">
                  {visible.questions.map((question) => {
                    const resolved = question.resolved || resolvedIds.has(question.id);
                    return (
                      <li key={question.id} className={cn("space-y-2 border-b border-border/60 px-5 py-4 last:border-0 sm:px-6", resolved && "opacity-60")}>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded border border-border px-1.5 font-mono text-[11px] tabular-nums text-foreground/90">
                            {String(question.slideNumber).padStart(2, "0")}
                          </span>
                          <span className="font-medium text-foreground/90">{question.recipientLabel}</span>
                          <span aria-hidden="true">·</span>
                          <time dateTime={question.createdAt}>{formatRelativeTime(question.createdAt)}</time>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">{question.body}</p>
                        {question.viewerEmail && <p className="text-xs text-muted-foreground">{question.viewerEmail}</p>}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!question.viewerEmail}
                            title={question.viewerEmail ? `Email ${question.viewerEmail}` : "No email was captured with this question."}
                            onClick={() => replyToQuestion(question)}
                            className="h-8 rounded-full text-xs"
                          >
                            <Mail />
                            Reply
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={resolved}
                            onClick={() => setResolvedIds((current) => new Set(current).add(question.id))}
                            className="h-8 rounded-full border-border bg-transparent text-xs shadow-none hover:bg-secondary"
                          >
                            {resolved ? "Resolved" : "Mark resolved"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {visible && section === "audit" && (
        <div role="tabpanel" id="deck-analytics-panel-audit" aria-labelledby="deck-analytics-tab-audit">
          <LinkActivitySection
            links={visible.links}
            copiedId={copiedId}
            onCopy={(id, url) => void copyLink(id, url)}
            onCreateLink={() => onCreateLink?.(deckId)}
          />
        </div>
      )}
    </section>
  );
}

export default AnalyticsPanel;
