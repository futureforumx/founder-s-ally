import { useRef, useCallback, useEffect, startTransition, type ReactElement, type ReactNode } from "react";
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
  Plug,
  Database,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CompanySettingsLogo } from "@/components/ui/company-settings-logo";
import { WorkspaceAccountMenu } from "@/components/WorkspaceAccountMenu";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";
import { requestOpenQuickActions } from "@/lib/appShellNavigate";

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
  | "investor-trending"
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
  workspaceName?: string | null;
  workspaceLogoUrl?: string | null;
  workspaceWebsiteUrl?: string | null;
  userStage?: string | null;
  profileCompletion?: number;
  personalCompletion?: number;
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

function NavSectionLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  if (collapsed) return null;
  return (
    <p className="px-2.5 pb-1.5 pt-4 text-[11px] font-medium text-sidebar-foreground/40">
      {children}
    </p>
  );
}

function ToolGlyph({
  tone,
  children,
}: {
  tone: "primary" | "success" | "warning" | "zinc";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px]",
        tone === "primary" && "bg-primary/15 text-primary",
        tone === "success" && "bg-success/15 text-success",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "zinc" && "bg-white/[0.07] text-zinc-200",
      )}
    >
      {children}
    </span>
  );
}

export function AppSidebar({
  activeView,
  onViewChange,
  collapsed = false,
  onToggleCollapsed,
  workspaceName,
  workspaceLogoUrl,
  workspaceWebsiteUrl,
  userStage,
  profileCompletion = 0,
  personalCompletion = 0,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAppAdmin } = useAppAdmin();
  const pendingNavFrameRef = useRef<number | null>(null);
  const displayName = workspaceName?.trim() || "Vekta";

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

        if (view === "home") {
          if (location.pathname !== "/" || location.search) navigate("/");
          onViewChange("home");
          return;
        }

        if (location.pathname === "/intelligence") navigate("/");
        onViewChange(view);
      });

      if (view === "investors") {
        window.requestAnimationFrame(dispatchInvestorsAllFocus);
      }
    });
  }, [location.pathname, location.search, navigate, onViewChange]);

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
      "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors whitespace-nowrap",
      active
        ? "bg-white/[0.07] text-sidebar-foreground"
        : "text-sidebar-foreground/55 hover:bg-white/[0.03] hover:text-sidebar-foreground",
      collapsed && "justify-center px-0",
    );
  const iconCls = "h-4 w-4 shrink-0 opacity-80";
  const toolIconCls = "h-2.5 w-2.5";

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

  const quickActionsButton = (
    <button
      type="button"
      onClick={requestOpenQuickActions}
      aria-label="Open quick actions"
      className={cn(
        "group flex w-full items-center rounded-full border border-white/[0.06] bg-white/[0.03] text-sidebar-foreground/45 transition-colors",
        "hover:border-white/[0.10] hover:bg-white/[0.05] hover:text-sidebar-foreground/70",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
        collapsed ? "h-8 justify-center px-0" : "h-[30px] justify-between px-3",
      )}
    >
      {collapsed ? (
        <span className="text-[11px] font-medium">⌘</span>
      ) : (
        <>
          <span className="flex items-center gap-2">
            <span className="text-[11px] font-medium">⌘</span>
            <span className="text-[12.5px]">Quick actions</span>
          </span>
          <span className="text-[11px] font-medium">K</span>
        </>
      )}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-white/[0.04] bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
          collapsed ? "w-14" : "w-60",
        )}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 pt-3",
            collapsed ? "flex-col px-2" : "px-3",
          )}
        >
          <div className={cn("flex min-w-0 items-center", collapsed ? "w-full justify-center" : "flex-1")}>
            <button
              type="button"
              onClick={() => goView("home")}
              aria-label="Go to home"
              className={cn(
                "flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors",
                "hover:bg-white/[0.03]",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[6px] ring-1 ring-white/10",
                  workspaceLogoUrl || workspaceWebsiteUrl ? "bg-white/[0.04]" : "bg-primary/20",
                )}
              >
                {workspaceLogoUrl || workspaceWebsiteUrl || workspaceName ? (
                  <CompanySettingsLogo
                    companyName={workspaceName}
                    logoUrl={workspaceLogoUrl}
                    websiteUrl={workspaceWebsiteUrl}
                    hasProfile={!!workspaceName?.trim()}
                    size={24}
                    alt=""
                    imgClassName="size-full object-contain"
                    initialClassName="text-[11px] font-semibold text-sidebar-foreground"
                    iconClassName="size-3.5 text-sidebar-foreground/70"
                  />
                ) : (
                  <img
                    src="/brand/vekta-form-header-mark.png"
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </span>
            </button>
            {!collapsed && (
              <WorkspaceAccountMenu
                companyName={workspaceName}
                logoUrl={workspaceLogoUrl}
                websiteUrl={workspaceWebsiteUrl}
                hasProfile={!!workspaceName?.trim()}
                userStage={userStage}
                profileCompletion={profileCompletion}
                personalCompletion={personalCompletion}
                onViewChange={(view) => goView(view)}
                align="start"
                side="bottom"
              >
                <button
                  type="button"
                  aria-label={`${displayName} workspace menu`}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors",
                    "hover:bg-white/[0.03] data-[state=open]:bg-white/[0.04]",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
                  )}
                >
                  <span className="min-w-0 truncate text-[13px] font-medium tracking-wide text-sidebar-foreground">
                    {displayName}
                  </span>
                  <svg
                    viewBox="0 0 12 12"
                    className="size-2.5 shrink-0 text-sidebar-foreground/35"
                    aria-hidden
                  >
                    <path
                      d="M3 4.5 6 7.5 9 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </WorkspaceAccountMenu>
            )}
          </div>
          {onToggleCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors",
                    "hover:bg-white/[0.04] hover:text-sidebar-foreground/80",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
                  )}
                >
                  {collapsed ? (
                    <PanelLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  ) : (
                    <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className={cn("shrink-0 pt-3", collapsed ? "px-2" : "px-3")}>
          <SidebarHint collapsed={collapsed} label="Quick actions (⌘K)">
            {quickActionsButton}
          </SidebarHint>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0 overflow-hidden",
            collapsed ? "px-2" : "px-2.5",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <NavSectionLabel collapsed={collapsed}>Intelligence</NavSectionLabel>
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

          <NavSectionLabel collapsed={collapsed}>My Company</NavSectionLabel>
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

          <NavSectionLabel collapsed={collapsed}>Tools</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Network workspace">
              <button
                type="button"
                onClick={() => goView("network-workspace")}
                className={navBtn(activeView === "network-workspace")}
              >
                <ToolGlyph tone="primary">
                  <Share2 className={toolIconCls} />
                </ToolGlyph>
                {!collapsed && "Network"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Investor targeting">
              <button
                type="button"
                onClick={() => goView("targeting")}
                className={navBtn(activeView === "targeting")}
              >
                <ToolGlyph tone="warning">
                  <Target className={toolIconCls} />
                </ToolGlyph>
                {!collapsed && "Targeting"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Circles">
              <button
                type="button"
                onClick={() => goView("circles")}
                className={navBtn(activeView === "circles")}
              >
                <ToolGlyph tone="primary">
                  <Orbit className={toolIconCls} />
                </ToolGlyph>
                {!collapsed && "Circles"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Connections">
              <button
                type="button"
                onClick={() => goView("connections")}
                className={navBtn(activeView === "connections")}
              >
                <ToolGlyph tone="zinc">
                  <Link2 className={toolIconCls} />
                </ToolGlyph>
                {!collapsed && "Connection"}
              </button>
            </SidebarHint>
            <SidebarHint collapsed={collapsed} label="Directory">
              <button
                type="button"
                onClick={() => goView("directory")}
                className={navBtn(activeView === "directory")}
              >
                <ToolGlyph tone="success">
                  <BookOpen className={toolIconCls} />
                </ToolGlyph>
                {!collapsed && "Directory"}
              </button>
            </SidebarHint>
          </div>

          <NavSectionLabel collapsed={collapsed}>Research</NavSectionLabel>
          <div className={group}>
            <SidebarHint collapsed={collapsed} label="Investor directory">
              <button
                type="button"
                onClick={() => goView("investor-search")}
                className={navBtn(
                  activeView === "investor-search" ||
                    activeView === "investor-trending",
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
                    activeView === "market-trending",
                )}
              >
                <Handshake className={iconCls} />
                {!collapsed && "Market"}
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

          {isAppAdmin && (
            <div className={cn(group, "pt-4")}>
              <SidebarHint collapsed={collapsed} label="Admin Console">
                <button
                  type="button"
                  onClick={() => navigate("/admin/intelligence")}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-2.5 text-[13px] font-medium text-success transition-colors hover:bg-success/20",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <UserCog className={iconCls} />
                  {!collapsed && "Admin Console"}
                </button>
              </SidebarHint>
            </div>
          )}
          </div>

          <div className="shrink-0 pt-2">
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
