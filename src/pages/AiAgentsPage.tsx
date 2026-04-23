import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Bot, Zap, Search, Presentation, Radar, Network, ArrowRight, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HERO_EXPLORE_MENU =
  "min-w-[12.5rem] rounded-lg border border-zinc-700/90 bg-zinc-950 py-1 text-zinc-100 shadow-xl";
const HERO_EXPLORE_ITEM = cn(
  "cursor-pointer rounded-none px-3 py-2 text-[13px] font-normal leading-snug text-zinc-200",
  "focus:bg-white/[0.06] focus:text-zinc-50 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-zinc-50",
);

type AgentStatus = "beta" | "coming-soon";

interface Agent {
  icon: React.ElementType;
  name: string;
  tagline: string;
  description: string;
  status: AgentStatus;
  bullets: string[];
}

const AGENTS: Agent[] = [
  {
    icon: Zap,
    name: "VEX Outreach",
    tagline: "Personalised investor outreach at scale",
    description:
      "Researches each investor, crafts context-aware messages aligned with your raise, and tracks engagement—so you spend time on replies, not cold drafts.",
    status: "beta",
    bullets: ["Investor profile research", "Stage & thesis matching", "Reply tracking"],
  },
  {
    icon: Radar,
    name: "Market Scanner",
    tagline: "Always-on market intelligence",
    description:
      "Continuously monitors funding rounds, competitor moves, and sector signals so your intelligence is always fresh without hours of manual research.",
    status: "coming-soon",
    bullets: ["Real-time funding alerts", "Competitor tracking", "Sector signal digest"],
  },
  {
    icon: Presentation,
    name: "Pitch Coach",
    tagline: "Investor-ready narrative, every time",
    description:
      "Reviews your pitch deck, executive summary, and talking points against thousands of successful raises to surface gaps before you're in the room.",
    status: "coming-soon",
    bullets: ["Deck gap analysis", "Executive summary review", "Q&A prep"],
  },
  {
    icon: Search,
    name: "Deal Scout",
    tagline: "Find investors you're missing",
    description:
      "Surfaces grants, angels, syndicates, and strategic investors ranked by fit score against your stage, sector, traction, and geography.",
    status: "coming-soon",
    bullets: ["Fit-score ranking", "Grant & angel discovery", "Strategic investor matching"],
  },
  {
    icon: Network,
    name: "Network Mapper",
    tagline: "Activate warm paths to investors",
    description:
      "Analyses your extended team network to surface second and third-degree connections to target investors—turning cold outreach into warm intros.",
    status: "coming-soon",
    bullets: ["Warm path discovery", "Intro request drafts", "Connection strength scoring"],
  },
  {
    icon: Bot,
    name: "VEX Assistant",
    tagline: "Your always-on fundraising co-pilot",
    description:
      "Answer investor questions, size markets, draft founder updates, and research VCs—available inside Vekta whenever you need a thinking partner.",
    status: "coming-soon",
    bullets: ["Investor Q&A prep", "Market sizing", "Founder update drafts"],
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your profile",
    body: "Vekta reads your stage, sector, traction, and raise details. Agents use this as their source of truth—no manual briefing required.",
  },
  {
    step: "02",
    title: "Deploy an agent",
    body: "Pick the workflow you want to automate. Each agent is purpose-built for one job and configured in seconds.",
  },
  {
    step: "03",
    title: "Review, not redo",
    body: "Agents surface outputs in your workspace. You approve, edit, or send—always in control without the legwork.",
  },
];

export default function AiAgentsPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "AI Agents · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  const betaAgents = AGENTS.filter((a) => a.status === "beta");
  const comingSoonAgents = AGENTS.filter((a) => a.status === "coming-soon");

  return (
    <div className="min-h-screen bg-[hsl(210_20%_99%)] font-sans text-zinc-950 antialiased">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="relative ml-[calc(50%-50vw)] w-screen max-w-none shrink-0 min-h-[min(44vh,460px)] border-b border-zinc-800 bg-black overflow-hidden">
        {/* Gradient background */}
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(91,92,255,0.35),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_80%,rgba(46,230,166,0.08),transparent)]" />
          <div className="absolute inset-0 bg-black/20" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-8 pt-8 sm:gap-7 sm:px-6 sm:pb-10 sm:pt-10">
          {/* Nav bar */}
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
                  <Link to="/fresh-capital">Fresh capital</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/?view=resources">Fundraising best practices</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                  <Link to="/?view=investor-funding">Recent funding</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Hero copy */}
          <div className="max-w-2xl space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">AI Agents</p>
            <h1 className="text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
              Let AI do the legwork.<br />You close the round.
            </h1>
            <p className="text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
              Purpose-built agents that automate investor research, outreach, and fundraising
              workflows—so founders spend more time on relationships and less time on repetition.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-[30px] rounded-full px-4 text-xs font-medium leading-none"
                onClick={() => {
                  document.getElementById("agents-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Explore agents
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-xs font-medium leading-none text-white hover:bg-white/15 hover:text-white"
                asChild
              >
                <Link to="/access">Get full access</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Available now ────────────────────────────────────────────────── */}
      {betaAgents.length > 0 && (
        <section id="agents-grid" className="bg-white">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/8 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">Available now</span>
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-zinc-950">Start automating today</h2>
            <p className="mt-1 max-w-xl text-sm text-zinc-600">
              These agents are live in Vekta. Connect your profile and deploy in minutes.
            </p>

            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {betaAgents.map((agent) => (
                <AgentCard key={agent.name} agent={agent} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-y border-zinc-200/80 bg-zinc-50/50">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">How it works</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Agents plug into your existing Vekta profile—no setup beyond what you've already done.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">{step.step}</p>
                <h3 className="text-sm font-semibold text-zinc-950">{step.title}</h3>
                <p className="text-[13px] leading-relaxed text-zinc-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coming soon ──────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Coming soon</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            The agent roadmap is shaped by founders. Tell us what to build next.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {comingSoonAgents.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Conversion ───────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-200/80 bg-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-xl space-y-5 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">Get started</p>
            <h2 className="text-balance text-2xl font-semibold text-[#eeeeee]">
              Your fundraise shouldn't run on spreadsheets.
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-[#a1a1aa]">
              Join founders using Vekta to raise smarter. AI agents, investor intelligence, and warm
              network activation—all in one workspace.
            </p>
            <Button className="h-9 gap-1.5 rounded-full px-6 text-sm font-medium" asChild>
              <Link to="/access">
                Get full access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200/80 bg-white py-8 text-center text-xs text-zinc-500">
        <p>
          © {new Date().getFullYear()} Vekta ·{" "}
          <Link
            to="/access"
            className="font-medium text-zinc-700 underline-offset-2 hover:underline"
          >
            Create an account
          </Link>{" "}
          ·{" "}
          <a href="https://tryvekta.com" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            tryvekta.com
          </a>
        </p>
      </footer>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const Icon = agent.icon;
  const isBeta = agent.status === "beta";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-5 shadow-sm transition-shadow",
        isBeta
          ? "border-violet-200/80 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_4px_20px_-4px_rgba(91,92,255,0.15)]"
          : "border-zinc-200 opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border",
            isBeta
              ? "border-violet-200 bg-violet-50 text-violet-500"
              : "border-zinc-200 bg-zinc-50 text-zinc-400",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            isBeta
              ? "bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-500/20"
              : "bg-zinc-100 text-zinc-500 ring-1 ring-inset ring-zinc-300/50",
          )}
        >
          {isBeta ? "Beta" : "Coming soon"}
        </span>
      </div>

      <div className="mt-4 space-y-1">
        <h3 className="text-sm font-semibold text-zinc-950">{agent.name}</h3>
        <p className="text-[11px] font-medium text-primary">{agent.tagline}</p>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{agent.description}</p>

      <ul className="mt-4 space-y-1.5">
        {agent.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Check className="h-3 w-3 shrink-0 text-emerald-500" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
