import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, Settings, BarChart3, Handshake, Building2, Gauge, BookOpen, Link2, MapPin, Swords, Search, ChevronDown, UsersRound, LogOut, UserCog, Sparkles, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/BrandLogo";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";

type ViewType =
  | "home"
  | "company"
  | "dashboard"
  | "industry"
  | "competitive"
  | "audit"
  | "benchmarks"
  | "market-intelligence"
  | "market-investors"
  | "market-market"
  | "market-tech"
  | "market-network"
  | "investors"
  | "investor-search"
  | "network"
  | "directory"
  | "connections"
  | "messages"
  | "events"
  | "competitors"
  | "sector"
  | "groups"
  | "data-room"
  | "resources"
  | "workspace"
  | "settings";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onAgentClick?: () => void;
}

const companyItems = [];

const communityItems = [
  { id: "directory" as const, label: "Directory", icon: BookOpen },
  { id: "groups" as const, label: "Groups", icon: UsersRound },
  { id: "events" as const, label: "Events", icon: MapPin },
];

function isMarketIntelView(v: ViewType) {
  return (
    v === "market-intelligence" ||
    v === "market-investors" ||
    v === "market-market" ||
    v === "market-tech" ||
    v === "market-network"
  );
}

export function AppSidebar({ activeView, onViewChange, onAgentClick }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { user, signOut } = useAuth();
  const { isAppAdmin } = useAppAdmin();

  const goView = (view: ViewType) => {
    if (isMarketIntelView(view)) {
      if (location.pathname !== "/intelligence") navigate("/intelligence");
      onViewChange(view);
      return;
    }
    if (location.pathname === "/intelligence") navigate("/");
    onViewChange(view);
    if (view === "investors") dispatchInvestorsAllFocus();
  };
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const [communityOpen, setCommunityOpen] = useState(
    activeView === "directory" || activeView === "groups" || activeView === "events",
  );

  useEffect(() => {
    setCommunityOpen(
      activeView === "directory" || activeView === "groups" || activeView === "events",
    );
  }, [activeView]);

  const missionControlActive =
    activeView === "dashboard" ||
    activeView === "industry" ||
    activeView === "competitive" ||
    activeView === "competitors" ||
    activeView === "sector";

  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);
  const agentPopoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAgentPopoverCloseTimer = useCallback(() => {
    if (agentPopoverCloseTimerRef.current != null) {
      clearTimeout(agentPopoverCloseTimerRef.current);
      agentPopoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleAgentPopoverClose = useCallback(() => {
    clearAgentPopoverCloseTimer();
    agentPopoverCloseTimerRef.current = setTimeout(() => {
      setAgentPopoverOpen(false);
      agentPopoverCloseTimerRef.current = null;
    }, 150);
  }, [clearAgentPopoverCloseTimer]);

  return (
      <aside
        className="flex h-screen w-44 flex-col bg-sidebar text-sidebar-foreground"
        data-community-expanded={communityOpen ? "true" : "false"}
        data-community-shortcuts={communityItems.length}
      >
        <div className="px-5 py-5">
          <button
            type="button"
            onClick={() => goView("home")}
            aria-label="Go to start page"
            className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0"
          >
            <BrandLogo
              variant="white"
              className="w-[112px]"
            />
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          <div className="ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Pulse — market intelligence feed"
                  onClick={() => goView("market-intelligence")}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground border border-transparent",
                    (activeView === "market-intelligence" ||
                      activeView === "market-investors" ||
                      activeView === "market-market" ||
                      activeView === "market-tech" ||
                      activeView === "market-network") &&
                      "border",
                  )}
                  style={(activeView === "market-intelligence" ||
                    activeView === "market-investors" ||
                    activeView === "market-market" ||
                    activeView === "market-tech" ||
                    activeView === "market-network") ? {
                    backgroundColor: "#d1d5db",
                    borderColor: "#4b5563",
                    color: "#1f2937",
                    boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
                  } : {}}>
                  <TrendingUp className="h-4 w-4 flex-shrink-0" />
                  Pulse
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px] text-xs">
                Intelligence: ranked market events. Or open{" "}
                <span className="font-mono text-[10px]">/intelligence</span>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-3 ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2">
            <button
              type="button"
              onClick={() => goView("investors")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                activeView === "investors" && "border",
              )}
              style={
                activeView === "investors"
                  ? {
                      backgroundColor: "#d1d5db",
                      borderColor: "#4b5563",
                      color: "#1f2937",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }
                  : {}
              }
            >
              <Zap className="h-4 w-4 shrink-0" />
              Network
            </button>
          </div>
          <div className="mt-3 px-2 pb-1 pt-0 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            MARKET
          </div>
          <div className="ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2">
            <button
              type="button"
              onClick={() => goView("market-market")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                activeView === "market-market" && "border",
              )}
              style={
                activeView === "market-market"
                  ? {
                      backgroundColor: "#d1d5db",
                      borderColor: "#4b5563",
                      color: "#1f2937",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }
                  : {}
              }
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              Market
            </button>
          </div>
          <div className="mt-3 px-2 pb-1 pt-0 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            NODES
          </div>
          <div className="ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2">
            <button
              type="button"
              onClick={() => goView("connections")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                activeView === "connections" && "border",
              )}
              style={
                activeView === "connections"
                  ? {
                      backgroundColor: "#d1d5db",
                      borderColor: "#4b5563",
                      color: "#1f2937",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }
                  : {}
              }
            >
              <Link2 className="h-4 w-4 shrink-0" />
              Connections
            </button>
            <button
              type="button"
              onClick={() => goView("network")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                activeView === "network" && "border",
              )}
              style={
                activeView === "network"
                  ? {
                      backgroundColor: "#d1d5db",
                      borderColor: "#4b5563",
                      color: "#1f2937",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }
                  : {}
              }
            >
              <Handshake className="h-4 w-4 shrink-0" />
              Operators
            </button>
          </div>
          <div className="mt-3 px-2 pb-1 pt-0 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            COMMAND
          </div>
          <div className="ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2">
            <button
              type="button"
              onClick={() => goView("dashboard")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                missionControlActive && "border",
              )}
              style={
                missionControlActive
                  ? {
                      backgroundColor: "#d1d5db",
                      borderColor: "#4b5563",
                      color: "#1f2937",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }
                  : {}
              }
            >
              <Gauge className="h-4 w-4 shrink-0" />
              Mission Control
            </button>
            <button
              type="button"
              onClick={() => goView("data-room")}
              className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", activeView === "data-room" && "border")}
              style={activeView === "data-room" ? {
                backgroundColor: "#d1d5db",
                borderColor: "#4b5563",
                color: "#1f2937",
                boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
              } : {}}>
              <FileText className="h-4 w-4" />
              Data Room
            </button>
          </div>
          {isAppAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin/intelligence")}
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <UserCog className="h-4 w-4" />
              Admin Console
            </button>
          )}
        </nav>

        <div className="border-t border-sidebar-border/30 px-3 py-4 mt-auto">
          <Popover
            open={agentPopoverOpen}
            onOpenChange={(next) => {
              clearAgentPopoverCloseTimer();
              setAgentPopoverOpen(next);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="VEKTA Vex — coming soon"
                aria-haspopup="dialog"
                aria-expanded={agentPopoverOpen}
                onPointerEnter={() => {
                  clearAgentPopoverCloseTimer();
                  setAgentPopoverOpen(true);
                }}
                onPointerLeave={scheduleAgentPopoverClose}
                onClick={onAgentClick}
                className="group flex w-full flex-row items-center justify-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)] transition-all hover:bg-violet-500/10 hover:border-violet-500/40 animate-pulse-glow-purple"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform duration-500 leading-none" />
                <span className="block text-[10px] font-thin uppercase tracking-[0.2em] text-violet-100/90 leading-none">
                  VEX
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-[min(260px,calc(100vw-2rem))] border-border/80 bg-popover p-4 text-popover-foreground shadow-lg"
              onPointerEnter={clearAgentPopoverCloseTimer}
              onPointerLeave={scheduleAgentPopoverClose}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <img
                  src="/brand/vekta-aurora-logo.png"
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-auto object-contain"
                />
                <p className="text-xs leading-relaxed text-popover-foreground">
                  VEKTA Vex is coming soon.{" "}
                  <a
                    href="https://tryvekta.com/aurora"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    Learn more
                  </a>
                  .
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </aside>
  );
}
