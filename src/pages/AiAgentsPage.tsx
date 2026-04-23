import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Zap, Search, Presentation, Radar, Network, ArrowLeft, ExternalLink, ChevronRight } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "vekta-app-sidebar-collapsed";

function readSidebarCollapsedFromStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type AgentStatus = "active" | "beta" | "coming-soon";

interface Agent {
  id: string;
  icon: React.ElementType;
  name: string;
  description: string;
  status: AgentStatus;
  action?: string;
}

const AGENTS: Agent[] = [
  {
    id: "vex-outreach",
    icon: Zap,
    name: "VEX Outreach",
    description: "AI-crafted, personalised investor outreach at scale. Researches each target and drafts context-aware messages aligned with your raise.",
    status: "beta",
    action: "Configure",
  },
  {
    id: "market-scanner",
    icon: Radar,
    name: "Market Scanner",
    description: "Continuously monitors funding rounds, competitor moves, and market signals so you always have fresh intelligence without manual research.",
    status: "coming-soon",
  },
  {
    id: "pitch-coach",
    icon: Presentation,
    name: "Pitch Coach",
    description: "Reviews your pitch deck, executive summary, and talking points against thousands of successful raises. Surfaces gaps before investor meetings.",
    status: "coming-soon",
  },
  {
    id: "deal-scout",
    icon: Search,
    name: "Deal Scout",
    description: "Identifies grants, angels, syndicates, and strategic investors you may be missing. Ranked by fit score against your stage, sector, and geography.",
    status: "coming-soon",
  },
  {
    id: "network-mapper",
    icon: Network,
    name: "Network Mapper",
    description: "Surfaces warm paths to target investors by analysing your team's extended network. Finds second and third-degree connections you can activate.",
    status: "coming-soon",
  },
  {
    id: "vex-assistant",
    icon: Bot,
    name: "VEX Assistant",
    description: "Your always-on AI co-pilot for fundraising questions, investor research, market sizing, and drafting founder updates — available in-app at any time.",
    status: "coming-soon",
  },
];

const STATUS_CONFIG: Record<AgentStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  beta: {
    label: "Beta",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  },
  "coming-soon": {
    label: "Coming soon",
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  },
};

function AgentCard({ agent }: { agent: Agent }) {
  const Icon = agent.icon;
  const status = STATUS_CONFIG[agent.status];
  const isLive = agent.status === "active" || agent.status === "beta";

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-0 border border-border/60 bg-card/70 transition-all duration-200",
        isLive
          ? "hover:border-violet-500/40 hover:shadow-[0_0_24px_-6px_rgba(91,92,255,0.25)]"
          : "opacity-75 hover:opacity-90",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl border",
              isLive
                ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                : "border-border/60 bg-muted/50 text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px] font-medium uppercase tracking-wider", status.className)}
          >
            {status.label}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-sm font-semibold">{agent.name}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{agent.description}</CardDescription>
      </CardHeader>
      {isLive && agent.action && (
        <CardContent className="pt-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-violet-500/30 bg-violet-500/5 px-3 text-[11px] text-violet-400 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300"
          >
            {agent.action}
            <ChevronRight className="h-3 w-3" />
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function AiAgentsPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsedFromStorage);

  useEffect(() => {
    const prev = document.title;
    document.title = "AI Agents · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleViewChange = useCallback(() => {}, []);

  const liveCount = AGENTS.filter((a) => a.status === "active" || a.status === "beta").length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        activeView="home"
        onViewChange={handleViewChange}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-6 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-border/60 select-none">/</span>
          <span className="text-xs font-medium text-foreground">AI Agents</span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 pb-12 pt-8">
            {/* Page header */}
            <div className="mb-8 flex items-start justify-between gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
                    <Bot className="h-5 w-5 text-violet-400" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  Deploy purpose-built agents to automate research, outreach, and fundraising workflows.
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-foreground">{liveCount}</p>
                <p className="text-[11px] text-muted-foreground">available now</p>
              </div>
            </div>

            {/* Active / Beta section */}
            {AGENTS.filter((a) => a.status !== "coming-soon").length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Available now
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {AGENTS.filter((a) => a.status !== "coming-soon").map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </section>
            )}

            {/* Coming soon section */}
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Coming soon
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AGENTS.filter((a) => a.status === "coming-soon").map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>

            {/* Footer CTA */}
            <div className="mt-10 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-6 py-5">
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Want an agent built for your workflow?</p>
                  <p className="text-xs text-muted-foreground">
                    Tell us what you'd automate and we'll prioritise it on the roadmap.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 border-violet-500/30 bg-violet-500/10 text-xs text-violet-400 hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-300"
                  onClick={() => window.open("https://tryvekta.com", "_blank", "noopener,noreferrer")}
                >
                  Request an agent
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
