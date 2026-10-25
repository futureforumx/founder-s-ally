import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowUp, ArrowUpRight, Building2, CircleDollarSign, Paperclip,
  Target, TrendingUp, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsCard } from "@/components/ui/stats-card";
import { ThinkingOrb } from "thinking-orbs";

interface IntelligenceLandingProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (query: string) => void;
  onViewChange: (view: string) => void;
  companyName?: string | null;
}

const FOCUS_PROMPTS = [
  { label: "🎯 Find Lead VCs", prompt: "Find seed-stage investors actively leading rounds in my sector" },
  { label: "✉️ Draft Outreach", prompt: "Find the best-fit investors and draft a forwardable warm intro" },
  { label: "📊 Market Multiples", prompt: "Show market multiples and recent comparable rounds for my sector" },
] as const;

const SUGGESTED_PROMPTS = [
  "Show seed funds actively leading rounds in AI tooling",
  "What is the median check size for my stage and sector?",
  "Draft a forwardable intro blurb for angel networks",
  "Which active investors have fresh funds closed in the last 180 days?",
] as const;

interface ChangeCard {
  icon: LucideIcon;
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  description: string;
  query: string;
}

const CHANGE_CARDS: ChangeCard[] = [
  { icon: Users, title: "New investor matches", value: "12", change: "+12 this week", changeType: "positive", description: "Fresh VCs aligned to your stage, sector, and traction.", query: "Find the 12 newest investor matches for my company and explain the fit" },
  { icon: Target, title: "Connection paths", value: "8", change: "+8 warm paths", changeType: "positive", description: "New intro routes surfaced across your network.", query: "Show my strongest warm introduction paths to active investors" },
  { icon: TrendingUp, title: "Company health", value: "82", change: "+4 pts", changeType: "positive", description: "Up from last week's snapshot in Mission Control.", query: "Summarize the latest changes in my company health and fundraising readiness" },
  { icon: CircleDollarSign, title: "Market moves", value: "23", change: "+23 rounds", changeType: "positive", description: "New funding activity detected in your sector.", query: "Summarize recent funding rounds and market moves in my sector" },
  { icon: Building2, title: "Competitor updates", value: "3", change: "3 shifts", changeType: "neutral", description: "Positioning and funding changes among rivals.", query: "Summarize recent positioning and funding updates for Vekta's rivals" },
  { icon: CircleDollarSign, title: "Fresh capital", value: "4 funds", change: "+$420M new dry powder", changeType: "positive", description: "Active deployment vehicles closed in your sector.", query: "Find four fresh funds with new dry powder actively deploying in my sector" },
];

export function IntelligenceLanding({ query, onQueryChange, onSubmit, onViewChange, companyName }: IntelligenceLandingProps) {
  const [attachedDeck, setAttachedDeck] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const displayName = companyName?.trim() || "your company";
  const submit = () => onSubmit(query);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-7 sm:py-10 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.075),transparent_68%)]" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center">
        <div className="relative mb-6 flex items-center justify-center" aria-hidden="true">
          <div className="absolute h-28 w-28 rounded-full animate-home-vyta-mark-aura-pulse bg-[radial-gradient(circle,rgba(148,163,184,0.28)_0%,rgba(100,116,139,0.12)_52%,transparent_82%)] blur-[20px]" />
          <div className="relative z-10">
            <ThinkingOrb state="working" size={64} speed={0.9} />
          </div>
        </div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">Vekta intelligence</p>
        <h1 className="text-center font-sans text-3xl font-medium tracking-tight sm:text-4xl">Search with a strategy.</h1>
        <p className="mb-7 mt-2 max-w-2xl text-center text-sm text-neutral-400">
          Find the right investors, understand your market, and decide what to do next for {displayName}.
        </p>

        <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-2xl shadow-black/20 focus-within:border-neutral-700">
          <input ref={fileInput} type="file" accept=".pdf,.ppt,.pptx,.key" className="hidden" onChange={(event) => setAttachedDeck(event.target.files?.[0]?.name ?? null)} />
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about target check sizes, lead partners, warm intro paths, or comps..."
              aria-label="Search investor intelligence"
              className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
            <button type="button" onClick={() => fileInput.current?.click()} className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200" aria-label="Attach Deck">
              <Paperclip className="h-3.5 w-3.5" /> {attachedDeck ? "Deck attached" : "Attach Deck"}
            </button>
            <button type="button" onClick={submit} disabled={!query.trim()} aria-label="Search" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors", query.trim() ? "bg-neutral-100 text-neutral-950 hover:bg-white" : "cursor-not-allowed bg-neutral-800 text-neutral-600")}>
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          {attachedDeck && <p className="px-2 pb-1 text-[11px] text-neutral-500">{attachedDeck} selected · deck context is not yet sent to search</p>}
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {FOCUS_PROMPTS.map((item) => (
            <button key={item.label} type="button" onClick={() => onQueryChange(item.prompt)} className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-100">
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative mt-5 w-full max-w-3xl overflow-x-auto py-1 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2 px-4">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onSubmit(prompt)} className="max-w-[360px] shrink-0 whitespace-normal rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-left font-sans text-xs leading-relaxed text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-100">
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 w-full">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="font-sans text-xs font-medium text-neutral-300">What’s changed</h2>
            <span className="text-[11px] text-neutral-500">Since your last visit</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHANGE_CARDS.map(({ icon: Icon, query: cardQuery, ...card }, index) => (
              <StatsCard
                key={card.title}
                {...card}
                icon={<Icon className="h-4 w-4" aria-hidden="true" />}
                onClick={() => onSubmit(cardQuery)}
                className="min-h-36"
                style={{ animation: "fade-in 380ms ease-out both", animationDelay: `${index * 55}ms` }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex w-full justify-end">
          <button type="button" onClick={() => onViewChange("investor-search")} className="text-xs text-neutral-500 transition-colors hover:text-neutral-200">Browse investor directory <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
}
