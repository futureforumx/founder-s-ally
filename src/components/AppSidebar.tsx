import { useRef, useCallback, useEffect, startTransition, type ReactElement } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Gauge,
  BookOpen,
  Link2,
  UserCog,
  UserCircle,
  TrendingUp,
  Zap,
  Share2,
  UserSearch,
  Handshake,
  Target,
  Orbit,
  ChevronLeft,
  ChevronRight,
  Plug,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppAdmin } from "@/hooks/useAppAdmin";
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
  | "investor-funding"
  | "network-workspace"
  | "network"
  | "directory"
  | "connections"
  | "messages"
  | "events"
  | "market-trending"
  | "competitors"
  | "sector"
  | "groups"
  | "data-room"
  | "resources"
  | "workspace"
  | "settings"
  | "profile-workspace"
  | "targeting"
  | "circles"
  | "integrations"
  | "data-hub";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  /** When true, sidebar shows icon rail only (labels in tooltips). */
  collapsed?: boolean;
  /** Toggle rail / expanded sidebar (persist preference in parent). */
  onToggleCollapsed?: () => void;
}

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

/** Thin full-width rule used to separate logical groups. */
function NavDivider() {
  return <div className="my-2 h-px shrink-0 bg-sidebar-border/50" aria-hidden />;
}

function NavSectionLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  if (collapsed) return null;
  return (
    <p className="px-2.5 pb-1 pt-1 text-[10px] font-light uppercase tracking-[0.22em] text-sidebar-foreground/45">
      {children}
    </p>
  );
}

export function AppSidebar({
  activeView,
  onViewChange,
  collapsed = false,
  onToggleCollapsed,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAppAdmin } = useAppAdmin();
  const pendingNavFrameRef = useRef<number | null>(null);

  const goView = useCallback((view: ViewType) => {
    if (typeof window === "undefined") {
      onViewChange(view);
      return;
    }

    if (pendingNavFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingNavFrameRef.current);
    }

    pendingNavFrameRef.current = window.requestAnimationFrame(() => {
      pendingNavFrameRef.current = null;

      startTransition(() => {
        if (isMarketIntelView(view)) {
          if (location.pathname !== "/intelligence") navigate("/intelligence");
          onViewChange(view);
          return;
        }

        if (location.pathname === "/intelligence") navigate("/");
        onViewChange(view);
      });

      if (view === "investors") {
        window.requestAnimationFrame(dispatchInvestorsAllFocus);
      }
    });
  }, [location.pathname, navigate, onViewChange]);

  useEffect(() => {
    return () => {
      if (pendingNavFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingNavFrameRef.current);
      }
    };
  }, []);
  const missionControlActive =
    activeView === "dashboard" ||
    activeView === "industry" ||
    activeView === "competitive" ||
    activeView === "competitors";

  const pulseRouteActive =
    activeView === "market-intelligence" ||
    activeView === "market-investors" ||
    activeView === "market-market" ||
    activeView === "market-tech";

  const group = "flex w-full flex-col gap-0.5";
  const navBtn = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors whitespace-nowrap",
      active
        ? "bg-white/[0.08] text-white"
        : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
      collapsed && "justify-center px-0",
    );
  const iconCls = "h-[18px] w-[18px] shrink-0";

  const goSettingsTab = useCallback((tab: "account" | "network") => {
    if (typeof window === "undefined") {
      onViewChange("settings");
      return;
    }

    if (pendingNavFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingNavFrameRef.current);
    }

    pendingNavFrameRef.current = window.requestAnimationFrame(() => {
      pendingNavFrameRef.current = null;
      startTransition(() => {
        navigate({ pathname: "/", search: `?view=settings&tab=${tab}` });
        onViewChange("settings");
      });
    });
  }, [navigate, onViewChange]);
  const activeSettingsTab = new URLSearchParams(location.search).get("tab");

  const pulseButton = (
    <button
      type="button"
      aria-label="Pulse — market intelligence feed"
      onClick={() => goView("market-intelligence")}
      className={navBtn(pulseRouteActive)}
    >
      <TrendingUp className={iconCls} />
      {!collapsed && "Pulse"}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
          collapsed ? "w-14" : "w-52",
        )}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
      >
        <div
          className={cn(
            "flex shrink-0 gap-2 pb-2 pt-2",
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
            <BrandLogo
              variant="white"
              sidebarMode={collapsed ? "collapsed" : "expanded"}
              className={cn(
                "object-contain",
                collapsed ? "max-h-12 w-auto max-w-full" : "max-h-14 w-auto max-w-full",
              )}
            />
          </button>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0 overflow-hidden",
            collapsed ? "px-2" : "px-2.5",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className={group}>
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

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>Radar</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Sector radar">
              <button
                type="button"
                onClick={() => goView("sector")}
                className={navBtn(activeView === "sector")}
              >
                <Target className={iconCls} />
                {!collapsed && "Sector"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Network radar">
              <button
                type="button"
                onClick={() => goView("market-network")}
                className={navBtn(activeView === "market-network")}
              >
                <Share2 className={iconCls} />
                {!collapsed && "Network"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Capital radar">
              <button
                type="button"
                onClick={() => goView("investor-funding")}
                className={navBtn(activeView === "investor-funding")}
              >
                <TrendingUp className={iconCls} />
                {!collapsed && "Capital"}
              </button>
            </SidebarHint>
          </div>

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>Network</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Network workspace">
              <button
                type="button"
                onClick={() => goView("network-workspace")}
                className={navBtn(activeView === "network-workspace")}
              >
                <Share2 className={iconCls} />
                {!collapsed && "Network"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Investor targeting">
              <button
                type="button"
                onClick={() => goView("targeting")}
                className={navBtn(activeView === "targeting")}
              >
                <Target className={iconCls} />
                {!collapsed && "Targeting"}
              </button>
            </SidebarHint>
            <div className={cn(group, !collapsed && "pl-6")}>
              <SidebarHint collapsed={collapsed} label="Circles">
                <button
                  type="button"
                  onClick={() => goView("circles")}
                  className={navBtn(activeView === "circles")}
                >
                  <Orbit className={iconCls} />
                  {!collapsed && "Circles"}
                </button>
              </SidebarHint>
              <SidebarHint collapsed={collapsed} label="Connections">
                <button
                  type="button"
                  onClick={() => goView("connections")}
                  className={navBtn(activeView === "connections")}
                >
                  <Link2 className={iconCls} />
                  {!collapsed && "Connection"}
                </button>
              </SidebarHint>
              <SidebarHint collapsed={collapsed} label="Directory">
                <button
                  type="button"
                  onClick={() => goView("directory")}
                  className={navBtn(activeView === "directory")}
                >
                  <BookOpen className={iconCls} />
                  {!collapsed && "Directory"}
                </button>
              </SidebarHint>
            </div>
          </div>

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>Research</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Investor directory">
              <button
                type="button"
                onClick={() => goView("investor-search")}
                className={navBtn(
                  activeView === "investor-search" ||
                    activeView === "investor-funding" ||
                    activeView === "market-trending",
                )}
              >
                <UserSearch className={iconCls} />
                {!collapsed && "Investors"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Market">
              <button
                type="button"
                onClick={() => goView("network")}
                className={navBtn(
                  activeView === "network" ||
                    activeView === "groups" ||
                    activeView === "events" ||
                    activeView === "directory",
                )}
              >
                <Handshake className={iconCls} />
                {!collapsed && "Market"}
              </button>
            </SidebarHint>
          </div>

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>Potential Matches</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Mission Control">
              <button
                type="button"
                onClick={() => goView("dashboard")}
                className={navBtn(missionControlActive)}
              >
                <Gauge className={iconCls} />
                {!collapsed && "Mission Control"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Investor matches">
              <button
                type="button"
                onClick={() => goView("investors")}
                className={navBtn(activeView === "investors")}
              >
                <Zap className={iconCls} />
                {!collapsed && "Matches"}
              </button>
            </SidebarHint>
          </div>

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>AutoRaise</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Data Room">
              <button
                type="button"
                onClick={() => goView("data-hub")}
                className={navBtn(activeView === "data-hub")}
              >
                <Database className={iconCls} />
                {!collapsed && "Data Room"}
              </button>
            </SidebarHint>
          </div>

          <NavDivider />

          <NavSectionLabel collapsed={collapsed}>Pipeline</NavSectionLabel>

          {isAppAdmin && (
            <>
              <NavDivider />
              <SidebarHint collapsed={collapsed} label="Admin Console">
                <button
                  type="button"
                  onClick={() => navigate("/admin/intelligence")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[13px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <UserCog className={iconCls} />
                  {!collapsed && "Admin Console"}
                </button>
              </SidebarHint>
            </>
          )}
          </div>

          <div className="shrink-0 pt-1">
            <NavDivider />
            <div className={group}>
              <SidebarHint collapsed={collapsed} label="Profile & Workspace">
                <button
                  type="button"
                  onClick={() => goSettingsTab("account")}
                  className={navBtn(activeView === "settings" && activeSettingsTab === "account")}
                >
                  <UserCircle className={iconCls} />
                  {!collapsed && "Profile & Workspace"}
                </button>
              </SidebarHint>
              <SidebarHint collapsed={collapsed} label="Integrations">
                <button
                  type="button"
                  onClick={() => goSettingsTab("network")}
                  className={navBtn(activeView === "settings" && activeSettingsTab === "network")}
                >
                  <Plug className={iconCls} />
                  {!collapsed && "Integrations"}
                </button>
              </SidebarHint>
            </div>
          </div>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
