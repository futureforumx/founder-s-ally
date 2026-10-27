import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, HelpCircle, Info, Loader2, Mail, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  likely_forwarded: "🔥 Likely Forwarded",
  high_conviction: "⚡ High Conviction",
  quick_dropoff: "⚠️ Quick Drop-off",
};

const SIGNAL_CLASS: Record<DiligenceSignal, string> = {
  likely_forwarded: "border-orange-400/30 bg-orange-400/10 text-orange-700 dark:text-orange-200",
  high_conviction: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700 dark:text-indigo-200",
  quick_dropoff: "border-amber-400/30 bg-amber-400/10 text-amber-800 dark:text-amber-200",
};

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-neutral-400 dark:hover:text-neutral-100"
          aria-label={label}
        >
          {label.startsWith("Session") ? <HelpCircle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

function MetricCard({ label, value, tip, tipLabel }: { label: string; value: string; tip?: string; tipLabel?: string }) {
  return (
    <article className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900/60">
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="truncate">{label}</span>
        {tip && <InfoTip label={tipLabel || label}>{tip}</InfoTip>}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tabular-nums tracking-tight text-neutral-950 dark:text-neutral-100">{value}</p>
    </article>
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
  const meta = slide.title ? `Slide ${slide.slideNumber} • ${slide.title}` : `Slide ${slide.slideNumber}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="grid cursor-default grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/5"
        >
          <p className="truncate text-sm text-neutral-800 dark:text-neutral-100">{meta}</p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", slide.isHotspot ? "bg-indigo-500" : "bg-neutral-700")}
              style={{ width: `${visibleWidth}%` }}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            {slide.isHighDropOff && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="High drop-off" />
            )}
            {slide.isHotspot && (
              <span className="hidden rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 sm:inline dark:text-indigo-200">
                🔥 Hotspot
              </span>
            )}
            <span className="w-12 text-right text-xs tabular-nums text-neutral-600 dark:text-neutral-300">{formatDuration(slide.averageSeconds)}</span>
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
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900/60">
      <div className="border-b border-neutral-200 px-4 py-4 dark:border-white/10 sm:px-5">
        <h3 className="text-sm font-semibold">Link activity</h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Views, time, and follow-through for each sharing link.</p>
      </div>
      {links.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">No sharing links created for this version yet.</p>
          <Button type="button" className="mt-4" onClick={onCreateLink}>
            <Plus />
            Create first link
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-200 dark:border-white/10">
                {["Recipient / Firm", "Link URL", "Views", "Avg. Time", "Completion", "Questions", "Last Active", "Diligence Signal"].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{link.recipientLabel}</p>
                    {link.status !== "active" && (
                      <p className="mt-0.5 text-[11px] capitalize text-neutral-500 dark:text-neutral-400">{link.status}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {link.url ? (
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[12rem] truncate text-xs text-neutral-500 dark:text-neutral-400" title={link.url}>{link.url}</span>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
                          aria-label={`Copy link for ${link.recipientLabel}`}
                          onClick={() => onCopy(link.id, link.url)}
                        >
                          {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{link.views}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(link.averageSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                      {slidesProgressLabel(link.slidesViewed, link.slideCount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{link.questions}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">{formatRelativeTime(link.lastActiveAt)}</td>
                  <td className="px-4 py-3">
                    {link.signal ? (
                      <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", SIGNAL_CLASS[link.signal])}>
                        {SIGNAL_LABEL[link.signal]}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
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
  const [questionsOpen, setQuestionsOpen] = useState(true);

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
    <section className="space-y-6 text-neutral-950 dark:text-neutral-100" aria-busy={loading}>
      <div role="tablist" aria-label="Deck analytics sections" className="flex flex-wrap items-center gap-1 border-b border-border pb-3">
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
                "rounded-md px-3 py-1.5 font-spaceGrotesk text-[11px] uppercase tracking-[0.14em] transition-colors",
                selected
                  ? "bg-primary/10 font-bold text-primary"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{section === "audit" ? "Audit log" : "Deck analytics"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            {section === "audit"
              ? "Sharing links for this deck version, and what each one did."
              : "Engagement and diligence signals across active links."}
            {visible && section === "analytics" && (
              <InfoTip label="Session tracking definitions">{visible.definitions.sessions}</InfoTip>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {decks.length > 0 && selectedDeck && (
            <Select value={selectedDeck.id} onValueChange={setDeckId}>
              <SelectTrigger aria-label="Deck version" className="h-9 w-[min(100%,17rem)] border-neutral-200 bg-white text-xs dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-100">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading || !selectedDeck}
            className="border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-100 dark:hover:bg-white/10"
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {decksLoading && !selectedDeck && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading deck versions…</p>}
      {!decksLoading && !selectedDeck && (
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-8 text-sm text-neutral-500 dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-400">
          Upload a pitch deck to view engagement.
        </div>
      )}

      {selectedDeck && !visible && loading && section === "analytics" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-900/60" />
          ))}
        </div>
      )}
      {selectedDeck && !visible && loading && section === "audit" && (
        <div className="h-48 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-900/60" aria-hidden="true" />
      )}

      {visible && section === "analytics" && (
        <div role="tabpanel" id="deck-analytics-panel-analytics" aria-labelledby="deck-analytics-tab-analytics" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <MetricCard label="Total Views" value={String(visible.summary.totalViews)} tip={visible.definitions.views} tipLabel="How views are counted" />
            <MetricCard label="Unique Visitors" value={String(visible.summary.uniqueVisitors)} />
            <MetricCard
              label="Avg. Viewing Time"
              value={formatDuration(visible.summary.averageViewingSeconds)}
              tip={visible.definitions.viewingTime}
              tipLabel="How viewing time is calculated"
            />
            <MetricCard
              label="Completion Rate"
              value={formatCompletionRate(visible.summary.completionRate)}
              tip={visible.definitions.completion}
              tipLabel="How completion is calculated"
            />
            <MetricCard label="Inbound Questions" value={String(visible.summary.inboundQuestions)} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.9fr)]">
            <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-neutral-900/60">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Slide-by-slide dwell</h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Average active time on each slide.</p>
              </div>
              {hasDwell ? (
                <>
                  <div className="max-h-[28rem] space-y-0.5 overflow-y-auto pr-1">
                    {visible.slides.map((slide) => (
                      <SlideRow key={slide.slideNumber} slide={slide} maxAverage={maxAverage} />
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    Indigo bars are the two longest slides. An amber mark means more than 40% of viewers stopped before the next slide.
                  </p>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                  Slide timing shows up after someone opens this version.
                </p>
              )}
            </section>

            <Collapsible open={questionsOpen} onOpenChange={setQuestionsOpen} className="rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900/60">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5">
                <span>
                  <span className="block text-sm font-semibold">Slide questions & feedback</span>
                  <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    {visible.questions.length === 0 ? "None yet" : `${visible.questions.length} from the viewer`}
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-500 transition-transform dark:text-neutral-400", questionsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-neutral-200 px-4 py-3 dark:border-white/10 sm:px-5">
                {visible.questions.length === 0 ? (
                  <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
                    Questions investors send from a slide show up here.
                  </p>
                ) : (
                  <ul className="max-h-96 space-y-3 overflow-y-auto">
                    {visible.questions.map((question) => {
                      const resolved = question.resolved || resolvedIds.has(question.id);
                      return (
                        <li key={question.id} className={cn("rounded-lg border border-neutral-200 p-3 dark:border-white/10", resolved && "opacity-60")}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                              Slide {question.slideNumber}
                            </span>
                            <time className="text-[11px] text-neutral-500 dark:text-neutral-400" dateTime={question.createdAt}>
                              {formatRelativeTime(question.createdAt)}
                            </time>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">{question.body}</p>
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {question.recipientLabel}
                            {question.viewerEmail ? ` · ${question.viewerEmail}` : ""}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!question.viewerEmail}
                              title={question.viewerEmail ? `Email ${question.viewerEmail}` : "No email was captured with this question."}
                              onClick={() => replyToQuestion(question)}
                              className="h-8 border-neutral-200 bg-transparent text-xs dark:border-white/10 dark:hover:bg-white/10"
                            >
                              <Mail />
                              Reply via Email
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={resolved}
                              onClick={() => setResolvedIds((current) => new Set(current).add(question.id))}
                              className="h-8 border-neutral-200 bg-transparent text-xs dark:border-white/10 dark:hover:bg-white/10"
                            >
                              {resolved ? "Resolved" : "Mark Resolved"}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CollapsibleContent>
            </Collapsible>
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
