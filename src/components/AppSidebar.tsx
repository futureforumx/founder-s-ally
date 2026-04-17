import { useState, useRef, useCallback, useEffect, Fragment, type ReactElement } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FileText,
  Gauge,
  BookOpen,
  Link2,
  MapPin,
  UserCog,
  TrendingUp,
  Zap,
  Share2,
  ChevronDown,
  UsersRound,
  Handshake,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { NETWORK_SURFACE_SECTION_HEADING } from "@/lib/networkNavVariant";
import { cn } from "@/lib/utils";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  | "investor-funding"
  | "network-workspace"
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
  /** When true, sidebar shows icon rail only (labels in tooltips). */
  collapsed?: boolean;
  /** Toggle rail / expanded sidebar (persist preference in parent). */
  onToggleCollapsed?: () => void;
}

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

/** Icon-only rail: wrap control so label is still available on hover / focus. */
function SidebarHint({ collapsed, label, children }: { collapsed: boolean; label: string; children: ReactElement }) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[260px] text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const activeNavStyle = {
  backgroundColor: "#d1d5db",
  borderColor: "#4b5563",
  color: "#1f2937",
  boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
} as const;

export function AppSidebar({
  activeView,
  onViewChange,
  onAgentClick,
  collapsed = false,
  onToggleCollapsed,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [communityOpen, setCommunityOpen] = useState(
    activeView === "directory" || activeView === "groups" || activeView === "events",
  );

  useEffect(() => {
    if (activeView === "directory" || activeView === "groups" || activeView === "events") {
      setCommunityOpen(true);
    }
  }, [activeView]);

  const missionControlActive =
    activeView === "dashboard" ||
    activeView === "industry" ||
    activeView === "competitive" ||
    activeView === "competitors" ||
    activeView === "sector";

  const pulseRouteActive =
    activeView === "market-intelligence" ||
    activeView === "market-investors" ||
    activeView === "market-market" ||
    activeView === "market-tech" ||
    activeView === "market-network";

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

  const rail = cn(
    "ml-1 flex flex-col gap-1 border-l border-sidebar-border/40 pl-2",
    collapsed && "ml-0 max-w-full items-center border-l-0 pl-0",
  );
  const navBtn = (active: boolean) =>
    cn(
      "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
      active && "border",
      collapsed && "justify-center px-1.5",
    );
  const sectionLabel = cn(
    "mt-2 px-2 pb-0.5 pt-0 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50",
    collapsed && "sr-only",
  );

  const pulseButton = (
    <button
      type="button"
      aria-label="Pulse — market intelligence feed"
      onClick={() => goView("market-intelligence")}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground border border-transparent",
        pulseRouteActive && "border",
        collapsed && "justify-center px-1.5 py-1.5",
      )}
      style={pulseRouteActive ? activeNavStyle : undefined}
    >
      <TrendingUp className="h-4 w-4 shrink-0" />
      {!collapsed && "Pulse"}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex h-screen min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
          collapsed ? "w-14" : "w-44",
        )}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        data-community-expanded={communityOpen ? "true" : "false"}
        data-community-shortcuts={communityItems.length}
      >
        <div
          className={cn(
            "flex shrink-0 gap-2 pb-3 pt-3",
            collapsed ? "flex-col items-center px-2" : "items-start px-3 pl-2",
          )}
        >
          {onToggleCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors",
                    "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0",
                    !collapsed && "mt-0.5",
                  )}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <button
            type="button"
            onClick={() => goView("home")}
            aria-label="Go to start page"
            className={cn(
              "min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0",
              collapsed ? "flex w-full justify-center" : "block flex-1 pt-0.5",
            )}
          >
            <BrandLogo variant="white" className={cn(collapsed ? "w-10" : "w-[68px]")} />
          </button>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden overflow-x-hidden",
            collapsed ? "px-1.5" : "px-3",
          )}
        >
          <div className={rail}>
            {collapsed ? (
              <SidebarHint collapsed={collapsed} label="Pulse — market intelligence feed">
                {pulseButton}
              </SidebarHint>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>{pulseButton}</TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs">
                  Intelligence: ranked market events. Or open{" "}
                  <span className="font-mono text-[10px]">/intelligence</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className={sectionLabel}>{NETWORK_SURFACE_SECTION_HEADING}</div>
          <div className={rail}>
            <SidebarHint collapsed={collapsed} label="Connections">
              <button
                type="button"
                onClick={() => goView("connections")}
                className={navBtn(activeView === "connections")}
                style={activeView === "connections" ? activeNavStyle : undefined}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {!collapsed && "Connection"}
              </button>
            </SidebarHint>

            <Collapsible open={communityOpen} onOpenChange={setCommunityOpen} className="w-full">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  title={collapsed ? "Community — Directory, Groups, Events" : undefined}
                  className={cn(
                    "mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                    collapsed && "mt-2 justify-center px-1.5",
                  )}
                  aria-expanded={communityOpen}
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                      communityOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  {!collapsed && <span>Community</span>}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className={cn("flex flex-col gap-1 pt-1", collapsed && "items-center")}>
                {communityItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  const row = (
                    <button
                      type="button"
                      onClick={() => goView(item.id)}
                      className={navBtn(active)}
                      style={active ? activeNavStyle : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && item.label}
                    </button>
                  );
                  return collapsed ? (
                    <SidebarHint key={item.id} collapsed={collapsed} label={item.label}>
                      {row}
                    </SidebarHint>
                  ) : (
                    <Fragment key={item.id}>{row}</Fragment>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className={sectionLabel}>Execution</div>
          <div className={rail}>
            <SidebarHint collapsed={collapsed} label="Network workspace">
              <button
                type="button"
                onClick={() => goView("network-workspace")}
                className={navBtn(activeView === "network-workspace")}
                style={activeView === "network-workspace" ? activeNavStyle : undefined}
              >
                <Share2 className="h-4 w-4 shrink-0" />
                {!collapsed && "Network"}
              </button>
            </SidebarHint>
          </div>

          <div className={sectionLabel}>Intelligence</div>
          <div className={rail}>
            <SidebarHint collapsed={collapsed} label="Investors">
              <button
                type="button"
                onClick={() => goView("investors")}
                className={navBtn(
                  activeView === "investors" || activeView === "investor-search" || activeView === "investor-funding",
                )}
                style={
                  activeView === "investors" || activeView === "investor-search" || activeView === "investor-funding"
                    ? activeNavStyle
                    : undefined
                }
              >
                <Zap className="h-4 w-4 shrink-0" />
                {!collapsed && "Investors"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Market">
              <button
                type="button"
                onClick={() => goView("network")}
                className={navBtn(activeView === "network")}
                style={activeView === "network" ? activeNavStyle : undefined}
              >
                <Handshake className="h-4 w-4 shrink-0" />
                {!collapsed && "Market"}
              </button>
            </SidebarHint>
          </div>

          <div className={sectionLabel}>Command</div>
          <div className={rail}>
            <SidebarHint collapsed={collapsed} label="Mission Control">
              <button
                type="button"
                onClick={() => goView("dashboard")}
                className={navBtn(missionControlActive)}
                style={missionControlActive ? activeNavStyle : undefined}
              >
                <Gauge className="h-4 w-4 shrink-0" />
                {!collapsed && "Mission Control"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Data Room">
              <button
                type="button"
                onClick={() => goView("data-room")}
                className={navBtn(activeView === "data-room")}
                style={activeView === "data-room" ? activeNavStyle : undefined}
              >
                <FileText className="h-4 w-4 shrink-0" />
                {!collapsed && "Data Room"}
              </button>
            </SidebarHint>
          </div>

          {isAppAdmin && (
            <SidebarHint collapsed={collapsed} label="Admin Console">
              <button
                type="button"
                onClick={() => navigate("/admin/intelligence")}
                className={cn(
                  "mt-1 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-500/20",
                  collapsed && "justify-center px-1.5",
                )}
              >
                <UserCog className="h-4 w-4 shrink-0" />
                {!collapsed && "Admin Console"}
              </button>
            </SidebarHint>
          )}
        </nav>

        <div className={cn("shrink-0 border-t border-sidebar-border/30 px-3 py-3", collapsed && "px-2")}>
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
                title={collapsed ? "VEKTA Vex — coming soon" : undefined}
                aria-label="VEKTA Vex — coming soon"
                aria-haspopup="dialog"
                aria-expanded={agentPopoverOpen}
                onPointerEnter={() => {
                  clearAgentPopoverCloseTimer();
                  setAgentPopoverOpen(true);
                }}
                onPointerLeave={scheduleAgentPopoverClose}
                onClick={onAgentClick}
                className={cn(
                  "group flex w-full flex-row items-center justify-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)] transition-all hover:bg-violet-500/10 hover:border-violet-500/40 animate-pulse-glow-purple",
                  collapsed && "px-1.5",
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform duration-500 leading-none" />
                {!collapsed && (
                  <span className="block text-[10px] font-thin uppercase tracking-[0.2em] text-violet-100/90 leading-none">
                    VEX
                  </span>
                )}
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
    </TooltipProvider>
  );
}
