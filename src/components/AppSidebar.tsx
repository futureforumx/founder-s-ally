import { useState, useRef, useCallback, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BarChart3, Handshake, Link2, UserCog, TrendingUp, Zap, Gauge, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/BrandLogo";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";

type ViewType =
  | "company"
  | "dashboard"
  | "industry"
  | "competitive"
  | "audit"
  | "benchmarks"
  | "market-intelligence"
  | "market-category"
  | "market-funding"
  | "market-regulatory"
  | "market-customer"
  | "market-ma"
  | "market-investors"
  | "market-market"
  | "market-tech"
  | "market-network"
  | "market-data-room"
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

function isMarketIntelView(v: ViewType) {
  return (
    v === "market-intelligence" ||
    v === "market-category" ||
    v === "market-funding" ||
    v === "market-regulatory" ||
    v === "market-customer" ||
    v === "market-ma"
  );
}

/** Icon column — fixed box; all glyphs align to same left optical edge */
const NAV_ICON_COL = "flex h-[18px] w-[18px] shrink-0 items-center justify-center";

const navIconClass =
  "h-[17px] w-[17px] stroke-[1.6] transition-[color,opacity] duration-150 ease-out";
/** Active: full opacity + cool violet tint (no glow) */
const navIconActive = "text-[#cbb8f0] opacity-100";
/** Inactive icons sit ~70% opacity; tier differentiates stroke color slightly */
const navIconIdleEmphasis =
  "text-white opacity-[0.72] group-hover:opacity-[0.82] group-hover:text-white";
const navIconIdleRest =
  "text-white opacity-[0.68] group-hover:opacity-[0.78] group-hover:text-white";

type NavContrastTier = "active" | "emphasis" | "rest";

function navIconClassForTier(tier: NavContrastTier) {
  if (tier === "active") return cn(navIconClass, navIconActive);
  if (tier === "emphasis") return cn(navIconClass, navIconIdleEmphasis);
  return cn(navIconClass, navIconIdleRest);
}

/**
 * Whisper label for multi-item clusters only — small, low-contrast, tight vertical rhythm.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      role="presentation"
      className="mb-0.5 mt-5 flex w-full min-w-0 items-center gap-2 pl-[6px] pr-[6px]"
    >
      <span className={NAV_ICON_COL} aria-hidden />
      <span className="whitespace-nowrap text-[11px] font-medium normal-case leading-none tracking-[0.08em] text-white/40">
        {children}
      </span>
    </div>
  );
}

/** Hairline cluster break — replaces a label when a single word header would be redundant */
function NavClusterRule() {
  return (
    <div
      className="my-[9px] flex w-full min-w-0 items-center gap-2 pl-[6px] pr-[6px]"
      role="presentation"
      aria-hidden
    >
      <span className={NAV_ICON_COL} />
      <div className="h-px min-w-0 flex-1 bg-gradient-to-r from-transparent via-white/[0.055] to-transparent" />
    </div>
  );
}

/** Tier from document order: active = 100% text; first inactive ≈83%, rest ≈67% (icons ~70% via classes) */
function navContrastTier(navIndex: number, active: boolean, firstInactiveIndex: number): NavContrastTier {
  if (active) return "active";
  if (navIndex === firstInactiveIndex) return "emphasis";
  return "rest";
}

/** Active: 2px brand rail, firmer fill; inactive text tiers 83% / 67%; no glow */
function navRowClass(tier: NavContrastTier) {
  const active = tier === "active";
  return cn(
    "group relative flex w-full min-w-0 items-center gap-2 rounded-[6px] py-[5px] pl-[6px] pr-[6px] text-left outline-none",
    "transition-[color,background-color,opacity] duration-150 ease-out",
    "focus-visible:ring-2 focus-visible:ring-[#a667ff]/28 focus-visible:ring-offset-0",
    "whitespace-nowrap text-[10px] uppercase leading-none tracking-[0.04em]",
    active ? "font-semibold" : "font-medium",
    active
      ? cn(
          "bg-[#a667ff]/[0.18] text-white",
          "before:pointer-events-none before:absolute before:left-0 before:top-[5px] before:bottom-[5px] before:w-[2px] before:bg-[#a667ff]",
        )
      : tier === "emphasis"
        ? "text-white/[0.83] hover:bg-white/[0.045] hover:text-white/[0.92]"
        : "text-white/[0.67] hover:bg-white/[0.045] hover:text-white/[0.82]",
  );
}

export function AppSidebar({ activeView, onViewChange, onAgentClick }: AppSidebarProps) {
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

  const missionControlActive =
    activeView === "dashboard" ||
    activeView === "industry" ||
    activeView === "competitive" ||
    activeView === "competitors" ||
    activeView === "sector";

  const networkSidebarActive =
    activeView === "investors" ||
    activeView === "investor-search" ||
    activeView === "directory";

  /** Brief only — other intel lanes belong to Market so Pulse + Market are never both active. */
  const pulseActive = activeView === "market-intelligence";

  /** Category, Funding, Regulatory, Customer, M&A (not Brief). */
  const marketIntelSidebarActive =
    isMarketIntelView(activeView) && activeView !== "market-intelligence";

  const navActiveFlags = [
    pulseActive,
    networkSidebarActive,
    marketIntelSidebarActive,
    activeView === "connections",
    missionControlActive,
    activeView === "market-investors" || activeView === "market-data-room",
    activeView === "competitors",
  ] as const;
  const firstInactiveNavIndex = navActiveFlags.findIndex((a) => !a);
  const navTier = (index: number, active: boolean) =>
    navContrastTier(index, active, firstInactiveNavIndex);

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
    }, 180);
  }, [clearAgentPopoverCloseTimer]);

  return (
    <aside
      className={cn(
        "relative flex h-screen w-[200px] shrink-0 flex-col text-sidebar-foreground",
        "bg-gradient-to-b from-[hsl(216,14%,16.2%)] via-[hsl(220,12%,11%)] to-[hsl(226,11%,7.2%)]",
        "shadow-[inset_1px_0_0_rgba(255,255,255,0.034)]",
      )}
    >
      <div className="border-b border-white/[0.04] px-[14px] pb-2.5 pt-4">
        <BrandLogo variant="white" className="w-[104px] opacity-100" />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col px-[10px] pb-2 pt-2">
        <div className="flex flex-col gap-[6px]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Pulse — market intelligence feed"
                onClick={() => goView("market-intelligence")}
                className={navRowClass(navTier(0, pulseActive))}
              >
                <span className={NAV_ICON_COL}>
                  <TrendingUp className={navIconClassForTier(navTier(0, pulseActive))} />
                </span>
                Pulse
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[220px] border-border/60 text-xs">
              Intelligence: ranked market events. Or open{" "}
              <span className="font-mono text-[10px]">/intelligence</span>
            </TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={() => goView("investors")}
            className={navRowClass(navTier(1, networkSidebarActive))}
          >
            <span className={NAV_ICON_COL}>
              <Zap className={navIconClassForTier(navTier(1, networkSidebarActive))} />
            </span>
            Network
          </button>
        </div>

        <NavClusterRule />
        <div className="flex flex-col gap-[6px]">
          <button
            type="button"
            onClick={() => goView("market-category")}
            className={navRowClass(navTier(2, marketIntelSidebarActive))}
          >
            <span className={NAV_ICON_COL}>
              <BarChart3 className={navIconClassForTier(navTier(2, marketIntelSidebarActive))} />
            </span>
            Market
          </button>
          <button
            type="button"
            onClick={() => goView("connections")}
            className={navRowClass(navTier(3, activeView === "connections"))}
          >
            <span className={NAV_ICON_COL}>
              <Link2 className={navIconClassForTier(navTier(3, activeView === "connections"))} />
            </span>
            Connections
          </button>
        </div>

        <SectionLabel>Command</SectionLabel>
        <div className="flex flex-col gap-[6px]">
          <button
            type="button"
            onClick={() => goView("dashboard")}
            className={navRowClass(navTier(4, missionControlActive))}
          >
            <span className={NAV_ICON_COL}>
              <Gauge className={navIconClassForTier(navTier(4, missionControlActive))} />
            </span>
            Mission Control
          </button>
          <button
            type="button"
            onClick={() => goView("market-investors")}
            className={navRowClass(
              navTier(5, activeView === "market-investors" || activeView === "market-data-room"),
            )}
          >
            <span className={NAV_ICON_COL}>
              <Handshake
                className={navIconClassForTier(
                  navTier(5, activeView === "market-investors" || activeView === "market-data-room"),
                )}
              />
            </span>
            Raise
          </button>
          <button
            type="button"
            onClick={() => goView("competitors")}
            className={navRowClass(navTier(6, activeView === "competitors"))}
          >
            <span className={NAV_ICON_COL}>
              <Swords className={navIconClassForTier(navTier(6, activeView === "competitors"))} />
            </span>
            Competitors
          </button>
        </div>

        {isAppAdmin && (
          <button
            type="button"
            onClick={() => navigate("/admin/intelligence")}
            className={cn(
              "group/admin mt-[18px] flex w-full min-w-0 items-center gap-2 rounded-[6px] border-0 py-[5px] pl-[6px] pr-[6px] text-left shadow-none",
              "whitespace-nowrap bg-transparent text-[10px] font-medium uppercase leading-none tracking-[0.04em]",
              "text-white/[0.57] transition-[color,background-color,opacity] duration-150 ease-out",
              "hover:bg-white/[0.045] hover:text-white/[0.68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a667ff]/22",
            )}
          >
            <span className={NAV_ICON_COL}>
              <UserCog className="h-[17px] w-[17px] stroke-[1.6] text-emerald-400/55 opacity-[0.58] transition-[color,opacity] duration-150 ease-out group-hover/admin:opacity-[0.72] group-hover/admin:text-emerald-400/75" />
            </span>
            Admin Console
          </button>
        )}
      </nav>

      <div className="relative mt-auto border-t border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-black/[0.18]">
        <div className="px-[10px] pb-2 pt-2">
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
                aria-label="VEKTA Vyta — coming soon"
                aria-haspopup="dialog"
                aria-expanded={agentPopoverOpen}
                onPointerEnter={() => {
                  clearAgentPopoverCloseTimer();
                  setAgentPopoverOpen(true);
                }}
                onPointerLeave={scheduleAgentPopoverClose}
                onClick={onAgentClick}
                className={cn(
                  "group relative flex w-full min-w-0 items-center justify-center gap-2 rounded-[6px] py-[5px] pl-[6px] pr-[6px]",
                  "whitespace-nowrap bg-transparent text-[11px] font-semibold uppercase leading-none tracking-[0.07em]",
                  "text-white/[0.67] transition-[background-color,color,filter] duration-150 ease-out",
                  "hover:bg-white/[0.045] hover:text-white/[0.82]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a667ff]/22",
                )}
              >
                <span className={NAV_ICON_COL}>
                  <img
                    src="/brand/vyta-mark.svg"
                    alt=""
                    width={17}
                    height={17}
                    className={cn(
                      "h-[17px] w-[17px] shrink-0 object-contain",
                      "invert drop-shadow-[0_0_5px_rgba(196,176,232,0.35)]",
                      "animate-aurora-icon-pulse will-change-[transform,opacity]",
                      "motion-reduce:animate-none motion-reduce:opacity-[0.85]",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "shrink-0 text-center",
                    "animate-aurora-text-pulse will-change-[color,text-shadow]",
                    "motion-reduce:animate-none motion-reduce:text-white/[0.67] motion-reduce:[text-shadow:none]",
                  )}
                >
                  Vyta
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
                  src="/brand/vyta-logo.svg"
                  alt=""
                  width={200}
                  height={84}
                  className="h-14 w-auto max-w-full object-contain dark:invert"
                />
                <p className="text-xs leading-relaxed text-popover-foreground">
                  VEKTA Vyta is coming soon.{" "}
                  <a
                    href="https://tryvekta.com/vyta"
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
      </div>
    </aside>
  );
}
