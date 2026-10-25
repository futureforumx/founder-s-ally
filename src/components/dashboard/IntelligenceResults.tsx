import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, Check, ExternalLink, Loader2, Mail, Search, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";
import type { SearchResult } from "./SearchOmnibar";
import { WebSearch, WebSearchAnswer, WebSearchCitation, type WebSource } from "@/components/ui/web-search";
import type { ReactNode } from "react";

export type IntelligenceQueryState = "idle" | "submitted" | "streaming" | "complete";

interface IntelligenceResultsProps {
  query: string;
  queryState: IntelligenceQueryState;
  results: SearchResult[];
  synthesis: string;
  sources: WebSource[];
  searchError: string | null;
  firms: VCFirm[];
  peopleByFirm: Map<string, VCPerson[]>;
  savedFirmIds: Set<string>;
  onSave: (firmId: string) => void;
  onSubmit: (query: string) => void;
  onBack: () => void;
  companyName: string;
}

function comparableName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getFaviconUrl(websiteUrl: string | null | undefined) {
  if (!websiteUrl) return null;
  try {
    const url = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=128`;
  } catch {
    return null;
  }
}

function InvestorVisual({ partner, logoUrl, websiteUrl }: { partner: VCPerson | null; logoUrl?: string | null; websiteUrl?: string | null }) {
  const sources = [partner?.profile_image_url || partner?.avatar_url, logoUrl, getFaviconUrl(websiteUrl)]
    .filter((source, index, list): source is string => Boolean(source) && list.indexOf(source) === index);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sourceKey = sources.join("|");

  useEffect(() => setSourceIndex(0), [sourceKey]);

  const source = sources[sourceIndex];
  if (!source) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-400"><UserRound className="h-4 w-4" /></span>;

  return <img src={source} alt="" onError={() => setSourceIndex((index) => index + 1)} className="h-10 w-10 shrink-0 rounded-xl border border-neutral-700 bg-neutral-800 object-contain p-1" />;
}

function formatUsd(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return value >= 1_000_000 ? `$${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M` : `$${Math.round(value / 1_000)}K`;
}

function renderCitations(text: string, sources: WebSource[], keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const citationPattern = /\[(?:source\s*)?(\d+)\]/gi;
  let cursor = 0;
  for (const match of text.matchAll(citationPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(text.slice(cursor, start));
    const source = sources[Number(match[1]) - 1];
    parts.push(source
      ? <WebSearchCitation key={`${keyPrefix}-citation-${start}`} source={source} index={Number(match[1])} />
      : match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function answerParagraphs(answer: string, sources: WebSource[]): ReactNode[] {
  return answer.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return <ul key={`answer-list-${index}`}>{lines.map((line, lineIndex) => <li key={lineIndex}>{renderCitations(line.replace(/^\s*[-*]\s+/, ""), sources, `${index}-${lineIndex}`)}</li>)}</ul>;
    }
    return <p key={`answer-paragraph-${index}`}>{renderCitations(block, sources, String(index))}</p>;
  });
}

export function IntelligenceResults({ query, queryState, results, synthesis, sources, searchError, firms, peopleByFirm, savedFirmIds, onSave, onSubmit, onBack, companyName }: IntelligenceResultsProps) {
  const navigate = useNavigate();
  const [followUp, setFollowUp] = useState("");
  const [draftingFor, setDraftingFor] = useState<SearchResult | null>(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);

  const entities = useMemo(() => results.map((result) => {
    const firm = firms.find((item) => comparableName(item.name) === comparableName(result.name)) ?? null;
    const partners = firm ? (peopleByFirm.get(firm.id) ?? []).filter((person) => person.is_active !== false) : [];
    const partner = partners.find((person) => person.seniority === "GENERAL_PARTNER" || person.seniority === "PARTNER") ?? partners[0] ?? null;
    return { result, firm, partner };
  }), [results, firms, peopleByFirm]);

  const submitFollowUp = (event: FormEvent) => {
    event.preventDefault();
    if (!followUp.trim()) return;
    onSubmit(followUp);
    setFollowUp("");
  };

  async function draftIntro(result: SearchResult, partner: VCPerson | null) {
    setDraftingFor(result);
    setDraft("");
    setDrafting(true);
    const partnerLabel = partner ? `${partner.full_name}, ${partner.title || "investor"}` : "the relevant investment partner";
    const prompt = `Write a concise, forwardable warm introduction blurb from the founder of ${companyName} to ${partnerLabel} at ${result.name}.\n\nInvestor context: ${result.subtitle}.\nReason this investor matched: ${result.matchReason}.\n\nUse only these facts. Do not invent traction, metrics, mutual connections, or claims. Include a short subject line and a 100-word maximum blurb.`;
    try {
      const { data, error } = await supabase.functions.invoke("research-agent", {
        body: { query: prompt, mode: "chat", searchProfile: "auto", maxUrlReads: 0 },
      });
      if (error) throw error;
      const content = data?.answer ?? data?.response ?? data?.text;
      if (typeof content !== "string" || !content.trim()) throw new Error(data?.error || "The assistant returned no draft.");
      setDraft(content.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not draft an intro.";
      toast.error("Intro draft unavailable", { description: message });
      setDraft(`Drafting could not be completed: ${message}`);
    } finally {
      setDrafting(false);
    }
  }

  const isWorking = queryState === "submitted" || queryState === "streaming";

  return (
    <div className="relative -mx-4 -mt-4 flex min-h-[calc(100vh-7rem)] flex-col bg-neutral-950 text-neutral-100 sm:-mx-7 lg:-mx-8">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to intelligence landing" className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"><ArrowLeft className="h-4 w-4" /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-neutral-500" />
            <span className="truncate text-sm text-neutral-200">{query}</span>
          </div>
          <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">Investor search</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-36 pt-7 sm:px-7 lg:px-8">
        {isWorking && (
          <div className="mb-6 flex flex-wrap gap-2" aria-live="polite">
            {["🔍 Searching investor database", "🎯 Matching your company profile", "⚡ Ranking thesis and stage fit"].map((step, index) => {
              const complete = queryState === "streaming" && index === 0;
              const active = queryState === "submitted" ? index === 0 : index === 1;
              return <span key={step} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${complete ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : active ? "border-neutral-700 bg-neutral-900 text-neutral-200" : "border-neutral-800 bg-neutral-950 text-neutral-500"}`}>{complete && <Check className="h-3 w-3" />}{active && <Loader2 className="h-3 w-3 animate-spin" />}{step}</span>;
            })}
          </div>
        )}

        <section className="mb-7 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-neutral-400" /><h1 className="text-sm font-medium text-neutral-100">Strategic synthesis</h1></div>
            {sources.length > 0 && <WebSearch sources={sources} status={isWorking ? "searching" : "done"} query={query} defaultOpen={false} className="w-auto font-sans text-neutral-100" />}
          </div>
          {searchError ? <p className="max-w-3xl text-sm leading-relaxed text-rose-300">{searchError}</p> : isWorking ? <div className="max-w-3xl space-y-2 animate-pulse"><div className="h-3 w-11/12 rounded bg-neutral-800" /><div className="h-3 w-9/12 rounded bg-neutral-800" /></div> : synthesis ? (
            <WebSearchAnswer className="max-w-3xl font-sans text-sm font-normal leading-relaxed text-neutral-200 [&_strong]:text-neutral-100">
              {answerParagraphs(synthesis, sources)}
            </WebSearchAnswer>
          ) : results.length ? (
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-neutral-200">
              <p>These {results.length} investor matches surfaced for “{query}”. Review each firm’s fit rationale and verified directory details before prioritizing outreach for {companyName}.</p>
              <ul className="list-disc space-y-1 pl-5 text-neutral-300">{results.slice(0, 3).map((result, index) => <li key={`${result.name}-${index}`}><span className="font-medium text-neutral-100">{result.name}:</span> {result.matchReason || result.subtitle}</li>)}</ul>
              <p className="text-xs text-neutral-500">The current search returns match context; check sizes, fund vintages, and mutual connections appear only when verified in the investor directory.</p>
            </div>
          ) : <p className="max-w-3xl text-sm leading-relaxed text-neutral-400">No investor matches were returned. Try a broader query or adjust the sector and stage.</p>}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-sm font-medium">Matching investors</h2><p className="mt-1 text-xs text-neutral-500">{isWorking ? "Finding relevant firms…" : `${results.length} results · Directory-backed details where available`}</p></div>
          </div>
          {isWorking ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/50" />)}</div> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {entities.map(({ result, firm, partner }, index) => {
                const checkMin = partner ? formatUsd(partner.check_size_min) : null;
                const checkMax = partner ? formatUsd(partner.check_size_max) : null;
                const checkRange = checkMin && checkMax ? `${checkMin} – ${checkMax}` : checkMin || checkMax || "Not listed";
                const isSaved = Boolean(firm && savedFirmIds.has(firm.id));
                return (
                  <article key={`${result.name}-${index}`} className="flex min-h-56 flex-col rounded-xl border border-neutral-800 bg-neutral-900/35 p-4 transition-colors hover:border-neutral-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-neutral-100">{result.name}</h3><div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="inline-flex rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300">{firm?.stages?.[0] ? `${firm.stages[0]} Lead` : "Investor"}</span>{typeof result.matchScore === "number" && <span className="inline-flex rounded-full border border-emerald-900/80 bg-emerald-950/30 px-2 py-0.5 font-mono text-[10px] tabular-nums text-emerald-300">{Math.round(result.matchScore)}% match</span>}</div></div>
                      <InvestorVisual partner={partner} logoUrl={result.logoUrl || firm?.logo_url} websiteUrl={result.websiteUrl || firm?.website_url} />
                    </div>
                    <p className="mt-2 truncate text-xs text-neutral-400">{partner ? `${partner.full_name}${partner.title ? ` · ${partner.title}` : ""}` : "Partner details unavailable"}</p>
                    <div className="my-4 space-y-2 border-y border-neutral-800/80 py-3 text-xs">
                      <div className="flex justify-between gap-3"><span className="text-neutral-500">Typical check</span><span className="font-mono tabular-nums text-neutral-200">{checkRange}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-neutral-500">Most recent fund</span><span className="text-right text-neutral-300">Not listed</span></div>
                      <div className="flex justify-between gap-3"><span className="text-neutral-500">Warm route</span><span className="text-right text-neutral-300">{partner?.linkedin_url ? "Partner profile available" : "Not found"}</span></div>
                    </div>
                    <p className="mb-4 line-clamp-3 text-xs leading-relaxed text-neutral-400">{result.matchReason || result.subtitle}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <button type="button" disabled={!firm || isSaved} onClick={() => firm && onSave(firm.id)} className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">{isSaved ? "Saved to CRM" : "Save to CRM"}</button>
                      <button type="button" onClick={() => void draftIntro(result, partner)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"><Mail className="h-3 w-3" /> Draft Intro</button>
                      <button type="button" onClick={() => {
                        const profileId = result.firmId || firm?.id || result.websiteUrl;
                        if (profileId) navigate(`/firms/${encodeURIComponent(profileId)}`);
                        else toast.error("Full profile unavailable", { description: "This match is not linked to a firm profile yet." });
                      }} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100">View Profile <ExternalLink className="h-3 w-3" /></button>
                    </div>
                    {!firm && <p className="mt-2 text-[10px] text-neutral-600">No matching firm record is linked, so CRM save is unavailable.</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-6 z-30 px-4">
        <form onSubmit={submitFollowUp} className="mx-auto flex max-w-2xl items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/80 p-2 shadow-2xl backdrop-blur-md">
          <input value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Ask a follow-up, e.g. Only show West Coast leads" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500" aria-label="Ask a follow-up" />
          <button type="submit" disabled={!followUp.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500" aria-label="Submit follow-up"><ArrowUp className="h-4 w-4" /></button>
        </form>
      </div>

      {draftingFor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraftingFor(null); }}>
        <section role="dialog" aria-modal="true" aria-label={draftingFor ? "Draft intro" : "Investor profile"} className="w-full max-w-xl rounded-2xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-medium">Intro to {draftingFor.name}</h2><p className="mt-1 text-xs text-neutral-500">AI draft · based only on available match context</p></div><button type="button" onClick={() => setDraftingFor(null)} className="text-xs text-neutral-500 hover:text-white">Close</button></div>
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm leading-relaxed text-neutral-200">{drafting ? <span className="inline-flex items-center gap-2 text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Drafting intro…</span> : draft || "Preparing draft…"}</div>
        </section>
      </div>}
    </div>
  );
}
