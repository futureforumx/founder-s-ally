import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Bot, Search, Network, FileText, Zap, TrendingUp, Brain, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── shared hero nav styles (mirrors FreshCapitalHero) ───────────────────────
const HERO_EXPLORE_MENU =
  "min-w-[12.5rem] rounded-lg border border-zinc-700/90 bg-zinc-950 py-1 text-zinc-100 shadow-xl";

const HERO_EXPLORE_ITEM = cn(
  "cursor-pointer rounded-none px-3 py-2 text-[13px] font-normal leading-snug text-zinc-200",
  "focus:bg-white/[0.06] focus:text-zinc-50 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-zinc-50",
);

// ─── agent definitions ────────────────────────────────────────────────────────
type AgentStatus = "live" | "beta" | "soon";

interface Agent {
  id: string;
  icon: React.ReactNode;
  name: string;
  tagline: string;
  description: string;
  status: AgentStatus;
  href?: string;
  accentColor: string;
}

const STATUS_STYLES: Record<AgentStatus, string> = {
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  beta: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  soon: "bg-zinc-800/60 text-zinc-500 border-zinc-700/40",
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  live: "Live",
  beta: "Beta",
  soon: "Coming soon",
};

const AGENTS: Agent[] = [
  {
    id: "vex",
    icon: <Sparkles className="h-5 w-5" />,
    name: "VEX",
    tagline: "Your fundraising co-pilot",
    description:
      "VEKTA's core AI assistant. Ask anything about investors, strategy, or your pipeline — VEX synthesises platform data and answers in real time.",
    status: "live",
    accentColor: "rgba(61,180,242,0.15)",
  },
  {
    id: "investor-match",
    icon: <Search className="h-5 w-5" />,
    name: "Investor Match",
    tagline: "AI-powered targeting",
    description:
      "Surfaces the investors most likely to write your check — scored against your stage, sector, traction, and geography in one click.",
    status: "live",
    href: "/",
    accentColor: "rgba(16,185,129,0.15)",
  },
  {
    id: "fresh-capital",
    icon: <TrendingUp className="h-5 w-5" />,
    name: "Fresh Capital Intel",
    tagline: "Track newly closed funds",
    description:
      "Monitors VC fund closes in real time so you can identify investors who just raised fresh capital and are actively deploying.",
    status: "live",
    href: "/fresh-capital",
    accentColor: "rgba(61,180,242,0.15)",
  },
  {
    id: "deck-audit",
    icon: <FileText className="h-5 w-5" />,
    name: "Deck Audit",
    tagline: "Pitch deck intelligence",
    description:
      "Upload your deck and get an AI-driven critique — narrative gaps, missing data slides, and a scored breakdown against what top VCs expect.",
    status: "live",
    accentColor: "rgba(139,92,246,0.15)",
  },
  {
    id: "agent-mode",
    icon: <Bot className="h-5 w-5" />,
    name: "Agent Mode",
    tagline: "Deep company verification",
    description:
      "Runs autonomous web research on any company — team size, last funding, investor history — and returns cited, structured data in seconds.",
    status: "live",
    accentColor: "rgba(245,158,11,0.15)",
  },
  {
    id: "network-intel",
    icon: <Network className="h-5 w-5" />,
    name: "Network Intelligence",
    tagline: "Warm path mapping",
    description:
      "Analyses your professional graph to find warm introductions to target investors — ranked by relationship strength and connection depth.",
    status: "beta",
    accentColor: "rgba(16,185,129,0.15)",
  },
  {
    id: "market-intel",
    icon: <Brain className="h-5 w-5" />,
    name: "Market Intelligence",
    tagline: "Sector & competitive signals",
    description:
      "Monitors deal flow, competitor funding rounds, and sector narratives so you can position your company in front of trend-aligned capital.",
    status: "beta",
    accentColor: "rgba(239,68,68,0.15)",
  },
  {
    id: "outreach-agent",
    icon: <Zap className="h-5 w-5" />,
    name: "Outreach Agent",
    tagline: "Personalised at scale",
    description:
      "Drafts hyper-personalised cold outreach for each investor — grounded in their portfolio thesis, recent investments, and stated preferences.",
    status: "soon",
    accentColor: "rgba(139,92,246,0.15)",
  },
];

// ─── component ────────────────────────────────────────────────────────────────
export default function AiAgentsPage() {
  useEffect(() => {
    document.title = "Agent Library · Vekta";
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#050505", color: "#f5f5f5" }}>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="relative ml-[calc(50%-50vw)] w-screen max-w-none shrink-0 min-h-[min(38vh,380px)] border-b border-zinc-800 bg-black">
        {/* background gradients */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 min-h-[min(38vh,380px)] bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.22),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(61,180,242,0.18),_transparent_28%),linear-gradient(135deg,_#050505_0%,_#0b0f14_45%,_#050505_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.42)_100%)]" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-8 pt-8 sm:gap-7 sm:px-6 sm:pb-10 sm:pt-10">
          {/* nav row */}
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/"
              aria-label="Vekta home"
              className="inline-flex shrink-0 items-center outline-none ring-offset-black transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <img
                src="/brand/vekta-hero-wordmark.svg"
                alt=""
                width={120}
                height={32}
                className="h-7 w-auto max-w-[min(40vw,9rem)] bg-transparent object-contain object-left sm:h-8 sm:max-w-[10rem]"
                decoding="async"
              />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[#eeeeee]/80 outline-none ring-offset-black transition-colors hover:bg-white/[0.06] hover:text-[#eeeeee] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=open]:bg-white/[0.06] data-[state=open]:text-[#eeeeee]"
              >
                <span>More resources</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className={HERO_EXPLORE_MENU}>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/?view=resources">Fundraising best practices</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/?view=investor-funding">Recent funding</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/?view=directory">Trending companies</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/ai-agents">Agent Library</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* hero copy */}
          <div className="max-w-2xl space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">Agent Library</p>
            <h1 className="text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
              AI agents built for founders raising capital
            </h1>
            <p className="text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
              Every agent in Vekta is purpose-built for one stage of the fundraise — from sourcing aligned investors to crafting the outreach that gets a reply.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-[30px] rounded-full px-4 text-xs font-medium leading-none"
                asChild
              >
                <Link to="/">Open Vekta</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-xs font-medium leading-none text-white hover:bg-white/15 hover:text-white"
                asChild
              >
                <Link to="/fresh-capital">Fresh Capital →</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Agent grid ──────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {/* ── CTA ─────────────────────────────────────────────────────── */}
        <div className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-6 py-10 text-center sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Get started</p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-tight text-[#eeeeee]">
            Put your fundraise on autopilot
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#8a8a8a]">
            Vekta combines every agent into a single workspace — so your pipeline, targeting, and outreach all move together.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              className="h-9 rounded-full px-5 text-[13px] font-medium"
              asChild
            >
              <Link to="/access">Request access</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full border-white/20 bg-white/5 px-5 text-[13px] font-medium text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link to="/">Sign in</Link>
            </Button>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/60 px-4 py-8 text-center">
        <p className="text-[12px] text-zinc-600">
          © {new Date().getFullYear()} Vekta ·{" "}
          <Link to="/fresh-capital" className="text-zinc-500 transition-colors hover:text-zinc-300">
            Fresh Capital
          </Link>
          {" · "}
          <Link to="/?view=resources" className="text-zinc-500 transition-colors hover:text-zinc-300">
            Resources
          </Link>
        </p>
      </footer>
    </div>
  );
}

// ─── AgentCard ────────────────────────────────────────────────────────────────
function AgentCard({ agent }: { agent: Agent }) {
  const isClickable = !!agent.href && agent.status !== "soon";

  const inner = (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-4 rounded-xl border border-zinc-800 p-5 transition-all duration-200",
        isClickable
          ? "cursor-pointer hover:border-zinc-600 hover:bg-zinc-900/60"
          : "cursor-default",
        agent.status === "soon" && "opacity-60",
      )}
      style={{ background: "rgba(10,10,12,0.7)" }}
    >
      {/* glow spot */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${agent.accentColor}, transparent 60%)`,
        }}
        aria-hidden
      />

      {/* icon + status */}
      <div className="relative flex items-start justify-between gap-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700/60 text-zinc-300"
          style={{ background: agent.accentColor }}
        >
          {agent.icon}
        </div>
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            STATUS_STYLES[agent.status],
          )}
        >
          {STATUS_LABELS[agent.status]}
        </span>
      </div>

      {/* text */}
      <div className="relative flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-[#eeeeee]">{agent.name}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">{agent.tagline}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#8a8a8a]">{agent.description}</p>
      </div>

      {/* arrow */}
      {isClickable && (
        <div className="relative mt-auto flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors group-hover:text-zinc-300">
          Explore
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </div>
  );

  if (isClickable) {
    return (
      <Link to={agent.href!} className="flex h-full">
        {inner}
      </Link>
    );
  }

  return <div className="flex h-full">{inner}</div>;
}
