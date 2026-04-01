import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Building2, Search, ChevronDown, ChevronRight, Zap, TrendingUp,
  Activity, Radio, Clock, Sparkles, ListFilter, Star, Flame, Users,
  X, Eye, Radar, Lock, CircleHelp, Cloud, CheckCircle2, WifiOff, CreditCard,
  User, Settings2, SlidersHorizontal, LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAutosaveStatus, type AutosaveStatus } from "@/hooks/useAutosave";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";
import { TopNavCompanyHealth } from "@/components/health/TopNavCompanyHealth";
import type { AnalysisResult } from "@/components/company-profile/types";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { FirmLogo } from "@/components/ui/firm-logo";

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
  | "settings";

interface GlobalTopNavProps {
  companyName?: string | null;
  logoUrl?: string | null;
  hasProfile: boolean;
  lastSyncedAt: Date | null;
  syncFlash: boolean;
  relativeTime: string;
  onNavigateProfile: () => void;
  activeView?: ViewType;
  onViewChange?: (view: ViewType) => void;
  onOpenCommandPalette?: () => void;
  userSector?: string | null;
  userStage?: string | null;
  profileCompletion?: number;
  personalCompletion?: number;
  investorSearchChip?: string;
  onInvestorSearchChipChange?: (chip: string) => void;
  investorSearchQuery?: string;
  onInvestorSearchQueryChange?: (query: string) => void;
  /** Fires with VC firm id + filter text when a directory row is chosen (firm or partner). */
  onInvestorDirectoryPick?: (pick: InvestorDirectoryPick) => void;
  onInvestorSuggestionSelect?: (suggestion: string) => void;
  analysisResult?: AnalysisResult | null;
}

// ── View metadata for breadcrumbs ──
const VIEW_META: Record<ViewType, { section: string; label: string; siblings?: { id: ViewType; label: string }[] }> = {
  dashboard: { section: "Mission Control", label: "Company" },
  industry: { section: "Mission Control", label: "Industry" },
  competitive: { section: "Mission Control", label: "Competitive" },
  "data-room": { section: "Raise", label: "Data Room" },
  "market-data-room": { section: "Raise", label: "Data Room" },
  company: { section: "My Company", label: "Company Settings", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  competitors: { section: "My Company", label: "Competitors", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  sector: { section: "My Company", label: "Sector", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  benchmarks: { section: "My Company", label: "Benchmarks", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  audit: { section: "My Company", label: "Deck Audit", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  investors: { section: "Investors", label: "ALL", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  "investor-search": { section: "Investors", label: "INVESTORS", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  directory: { section: "Investors", label: "OPERATORS", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  connections: { section: "Nodes", label: "Connections" },
  network: { section: "Network", label: "Overview" },
  groups: { section: "Community", label: "Groups", siblings: [
    { id: "directory", label: "OPERATORS" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  events: { section: "Community", label: "Events", siblings: [
    { id: "directory", label: "OPERATORS" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  messages: { section: "Community", label: "Messages" },
  "market-intelligence": { section: "Pulse", label: "Brief" },
  "market-category": { section: "Pulse", label: "Category" },
  "market-funding": { section: "Pulse", label: "Funding" },
  "market-regulatory": { section: "Pulse", label: "Regulatory" },
  "market-customer": { section: "Pulse", label: "Customer" },
  "market-ma": { section: "Pulse", label: "M&A / Strategic Moves" },
  "market-investors": { section: "Raise", label: "Investors" },
  "market-market": { section: "Pulse", label: "Category" },
  "market-tech": { section: "Pulse", label: "Funding" },
  "market-network": { section: "Pulse", label: "M&A / Strategic Moves" },

  resources: { section: "Resources", label: "Help Center" },
  settings: { section: "Settings", label: "Settings" },
};

// ── Contextual AI suggestions per view ──
function getContextSuggestions(view: ViewType, sector?: string | null, stage?: string | null): string[] {
  const s = sector || "Technology";
  const st = stage || "Seed";
  switch (view) {
    case "investor-search":
    case "investors":
    case "directory":
      return [
        `Lead ${s} investors`,
        `Top ${s} funds actively deploying`,
        `Investors writing ${st} checks`,
      ];
    case "connections":
      return [
        "Warm intros through shared investors",
        `${s} investors in my network`,
        "Recently connected funds",
      ];
    case "network":
      return [
        `${s} founders near me`,
        "Second-time founders raising now",
        `Operators with ${s} experience`,
      ];
    case "market-intelligence":
    case "market-category":
    case "market-funding":
    case "market-regulatory":
    case "market-customer":
    case "market-ma":
    case "market-investors":
    case "market-market":
    case "market-tech":
    case "market-network":
    case "market-data-room":
      return [
        "Funds that led rounds in my space this week",
        "Competitor pricing and packaging changes",
        "Regulatory updates affecting GTM",
      ];
    case "competitors":
    case "benchmarks":
    case "industry":
    case "competitive":
      return [
        `Top ${s} competitors`,
        "Companies at similar stage",
        `${s} market leaders`,
      ];
    case "company":
    case "sector":
      return [
        `${s} market trends`,
        "Similar companies in my sector",
        `${st} stage benchmarks`,
      ];
    default:
      return [
        `Lead ${s} investors`,
        `${s} founders near me`,
        "Trending startups this week",
      ];
  }
}

// ── Filter chips config ──
const FILTER_CHIPS = [
  { id: "all", label: "INVESTORS", icon: ListFilter },
  { id: "matches", label: "Matches", icon: Zap },
  { id: "sector", label: "Sector", icon: Building2 },
  { id: "stage", label: "Stage", icon: TrendingUp },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: Star },
  { id: "recent", label: "Recent", icon: Clock },
];

type SearchDropdownRow =
  | { kind: "ai"; suggestion: string }
  | {
      kind: "firm";
      id: string;
      name: string;
      subtitle: string;
      logoUrl?: string | null;
      websiteUrl?: string | null;
    }
  | { kind: "person"; id: string; name: string; subtitle: string; firmId: string };

type InvestorTypeaheadRow = Extract<SearchDropdownRow, { kind: "firm" } | { kind: "person" }>;

/** Passed when user picks a firm or person in investor typeahead so the directory can scroll to the firm card. */
export type InvestorDirectoryPick = {
  vcFirmId: string;
  /** Applied to the investor grid text filter (firm name; for people, their fund name). */
  filterQuery: string;
};

function buildInvestorDirectoryPick(
  row: InvestorTypeaheadRow,
  firmMap: Map<string, { name: string }>,
): InvestorDirectoryPick {
  if (row.kind === "firm") {
    return { vcFirmId: row.id, filterQuery: row.name };
  }
  const firmName = firmMap.get(row.firmId)?.name || row.subtitle || row.name;
  return { vcFirmId: row.firmId, filterQuery: firmName };
}

const MOST_RELATED_CAP = 5;
const MAX_PER_SECTION = 25;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Higher = better match for ranking “most related”. */
function nameMatchScore(name: string, qLower: string): number {
  const n = name.toLowerCase().trim();
  if (!qLower || !n.includes(qLower)) return -1;
  if (n === qLower) return 1000;
  if (n.startsWith(qLower)) return 800;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(qLower))) return 650;
  const idx = n.indexOf(qLower);
  if (idx === 0) return 800;
  if (idx > 0 && (n[idx - 1] === " " || n[idx - 1] === "-" || n[idx - 1] === "/")) return 550;
  return 400;
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function HighlightedName({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="font-medium text-foreground">{text}</span>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = text.split(re);
  const qLower = q.toLowerCase();
  return (
    <span className="font-medium text-foreground">
      {parts.map((part, i) =>
        part.toLowerCase() === qLower ? (
          <mark
            key={i}
            className="rounded px-0.5 font-semibold bg-foreground/[0.08] text-foreground dark:bg-white/[0.12]"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// ── Live Market Pulse (click navigates to the matching Pulse / Network surface) ──
type PulseNav =
  | { kind: "intel"; view: ViewType }
  | { kind: "investor"; chip: string; scrollCohorts: boolean };

const PULSE_MESSAGES: readonly {
  text: string;
  icon: LucideIcon;
  color: string;
  nav: PulseNav;
}[] = [
  { text: "12 New Seed Rounds Today", icon: Zap, color: "text-emerald-400", nav: { kind: "intel", view: "market-funding" } },
  { text: "3 Funds Actively Deploying", icon: Activity, color: "text-sky-400", nav: { kind: "investor", chip: "matches", scrollCohorts: true } },
  { text: "AI Sector +18% This Week", icon: TrendingUp, color: "text-amber-400", nav: { kind: "intel", view: "market-category" } },
  { text: "8 New Investors Added", icon: Radio, color: "text-violet-400", nav: { kind: "investor", chip: "recent", scrollCohorts: true } },
];

function useRotatingPulse(interval = 4000) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PULSE_MESSAGES.length), interval);
    return () => clearInterval(t);
  }, [interval]);
  return PULSE_MESSAGES[idx];
}

const INVESTOR_DIRECTORY_SEGMENTS: { id: "investors" | "investor-search" | "directory"; label: string }[] = [
  { id: "investors", label: "All" },
  { id: "investor-search", label: "Investors" },
  { id: "directory", label: "Operators" },
];

const MARKET_INTEL_SEGMENTS: { id: ViewType; label: string }[] = [
  { id: "market-intelligence", label: "Brief" },
  { id: "market-category", label: "Category" },
  { id: "market-funding", label: "Funding" },
  { id: "market-regulatory", label: "Regulatory" },
  { id: "market-customer", label: "Customer" },
  { id: "market-ma", label: "M&A / Strategic Moves" },
];

const MARKET_INTEL_SEGMENT_IDS = new Set<ViewType>(MARKET_INTEL_SEGMENTS.map((s) => s.id));

function pulseIntelActiveLabel(view: ViewType): string {
  return MARKET_INTEL_SEGMENTS.find((s) => s.id === view)?.label ?? "Brief";
}

/** Raise (home `/`): top nav is Data Room only — Investor Match stays on sidebar Raise. */
const RAISE_SEGMENTS: readonly { id: ViewType; label: string }[] = [
  { id: "market-data-room", label: "Data Room" },
];

const MISSION_CONTROL_SEGMENTS: { id: ViewType; label: string }[] = [
  { id: "dashboard", label: "Company" },
  { id: "industry", label: "Industry" },
  { id: "competitive", label: "Competitive" },
  { id: "competitors", label: "Competitors" },
  { id: "sector", label: "Sector" },
];

const COMMUNITY_SEGMENTS: { id: "network" | "groups" | "events"; label: string }[] = [
  { id: "network", label: "Overview" },
  { id: "groups", label: "Groups" },
  { id: "events", label: "Events" },
];

/** Light purple focus ring on the active top-nav tab / segment (matches VEKTA accent, restrained). */
const TOP_NAV_ACTIVE_OUTLINE =
  "ring-1 ring-[#a667ff]/40 ring-offset-0 ring-offset-background dark:ring-[#b892f0]/45";

/** Active tab label: foreground-first with a slight violet cast (not full accent saturation). */
const TOP_NAV_TAB_TEXT_ACTIVE =
  "text-[#3f3650] dark:text-[#ebe8f6]";

/** Mobile section trigger — matches segmented control chrome (Network / directory pattern). */
const TOP_NAV_MOBILE_SECTION_TRIGGER = cn(
  "flex h-8 items-center gap-1.5 rounded-[9px] border border-border/35 bg-muted/35 px-2.5",
  "text-[10px] font-semibold uppercase leading-none tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  TOP_NAV_TAB_TEXT_ACTIVE,
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
  "dark:border-white/[0.07] dark:bg-white/[0.04]",
  "hover:bg-muted/50 dark:hover:bg-white/[0.07]",
  TOP_NAV_ACTIVE_OUTLINE,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0",
);

/**
 * Shared top-nav segmented control (same instrument as Investor / Network directory).
 * Radiogroup + roving tabindex; keyboard arrows move selection.
 */
function TopNavSegmentedControl<T extends string>({
  segments,
  activeId,
  onSelect,
  ariaLabel,
  widthClassName,
  density = "default",
  labelTransform = "uppercase",
  /** `hug`: natural-width segments that wrap inside the pill when space is tight (no horizontal scroll). `stretch`: equal flex columns (short labels). */
  segmentLayout = "stretch",
}: {
  segments: readonly { id: T; label: string }[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  widthClassName?: string;
  density?: "default" | "compact";
  labelTransform?: "uppercase" | "none";
  segmentLayout?: "stretch" | "hug";
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = segments.findIndex((s) => s.id === activeId);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const focusIndex = useCallback((i: number) => {
    const el = btnRefs.current[i];
    if (el) queueMicrotask(() => el.focus());
  }, []);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const len = segments.length;
      let next = safeIndex;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next = (safeIndex + 1) % len;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        next = (safeIndex - 1 + len) % len;
      } else if (e.key === "Home") {
        e.preventDefault();
        next = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        next = len - 1;
      } else {
        return;
      }
      const seg = segments[next];
      if (seg) {
        onSelect(seg.id);
        focusIndex(next);
      }
    },
    [focusIndex, onSelect, safeIndex, segments],
  );

  const densityCls =
    density === "compact"
      ? "px-1.5 py-1 text-[9px] leading-none tracking-[0.05em] sm:px-2 sm:text-[10px] sm:tracking-[0.06em]"
      : "px-2 py-1 text-[10px] leading-none tracking-[0.08em]";

  const labelCls = labelTransform === "uppercase" ? "font-medium uppercase" : "font-medium normal-case";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        "items-stretch rounded-[9px] border border-border/35",
        "bg-muted/35 p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        "dark:border-white/[0.07] dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        segmentLayout === "hug"
          ? "flex min-h-8 w-full min-w-0 max-w-full flex-wrap content-start gap-y-0.5"
          : cn("inline-flex h-8 shrink-0 flex-nowrap", widthClassName),
      )}
    >
      {segments.map((seg, i) => {
        const selected = activeId === seg.id;
        return (
          <button
            key={seg.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(seg.id)}
            title={seg.label}
            className={cn(
              "relative min-h-0 rounded-md text-center whitespace-nowrap",
              segmentLayout === "hug" ? "shrink-0" : "min-w-0 flex-1",
              densityCls,
              labelCls,
              "transition-[color,background-color,box-shadow,ring-color,transform] duration-150 ease-out",
              "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0",
              selected
                ? cn(
                    TOP_NAV_TAB_TEXT_ACTIVE,
                    "shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.12)]",
                    "bg-background/95 font-semibold",
                    TOP_NAV_ACTIVE_OUTLINE,
                    "dark:bg-white/[0.1] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
                  )
                : cn(
                    "text-muted-foreground/70 hover:bg-muted/45 hover:text-foreground/88",
                    "dark:text-white/45 dark:hover:bg-white/[0.06] dark:hover:text-white/80",
                  ),
            )}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

export function GlobalTopNav({
  companyName,
  logoUrl,
  hasProfile,
  lastSyncedAt,
  syncFlash,
  relativeTime,
  onNavigateProfile,
  activeView = "dashboard",
  onViewChange,
  onOpenCommandPalette,
  userSector,
  userStage,
  profileCompletion = 0,
  personalCompletion = 0,
  investorSearchChip,
  onInvestorSearchChipChange,
  investorSearchQuery,
  onInvestorSearchQueryChange,
  onInvestorDirectoryPick,
  onInvestorSuggestionSelect,
  analysisResult,
}: GlobalTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeChip, setActiveChip] = useState("all");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [logoImgError, setLogoImgError] = useState(false);

  // Reset error state whenever the URL changes so a new URL gets a fresh attempt
  useEffect(() => { setLogoImgError(false); }, [logoUrl]);
  const searchRef = useRef<HTMLDivElement>(null);
  const pulse = useRotatingPulse();

  const autosaveStatus = useAutosaveStatus();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const routeView = useCallback(
    (v: ViewType) => {
      const resolved = v === "data-room" ? ("market-data-room" as ViewType) : v;
      const intel = MARKET_INTEL_SEGMENT_IDS.has(resolved);
      if (intel) {
        if (location.pathname !== "/intelligence") navigate("/intelligence");
      } else if (location.pathname === "/intelligence") {
        navigate("/");
      }
      onViewChange?.(resolved);
      if (resolved === "investors") dispatchInvestorsAllFocus();
    },
    [location.pathname, navigate, onViewChange]
  );

  const handlePulseClick = useCallback(() => {
    const { nav } = pulse;
    if (nav.kind === "intel") {
      routeView(nav.view);
      return;
    }
    if (location.pathname === "/intelligence") navigate("/");
    onInvestorSearchChipChange?.(nav.chip);
    if (nav.scrollCohorts) {
      const scrollToCohorts = () => {
        document
          .querySelector<HTMLElement>("[data-section=\"network-pulse-cohorts\"]")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      requestAnimationFrame(() => requestAnimationFrame(scrollToCohorts));
    }
  }, [pulse, routeView, location.pathname, navigate, onInvestorSearchChipChange]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const handler = () => setScrolled(main.scrollTop > 12);
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // Keep filter chips aligned with investor directory tab when opening search
  useEffect(() => {
    if (!searchOpen) return;
    if (investorSearchChip) setActiveChip(investorSearchChip);
  }, [searchOpen, investorSearchChip]);

  const isInvestorArea = ["investors", "investor-search", "directory"].includes(activeView);
  const { firms: vcFirms, people: vcPeople, firmMap } = useVCDirectory();

  const suggestions = useMemo(
    () => getContextSuggestions(activeView, userSector, userStage),
    [activeView, userSector, userStage],
  );
  const investorSearchTrim = (investorSearchQuery ?? "").trim();

  const investorTypeahead = useMemo(() => {
    if (!isInvestorArea || !investorSearchTrim) {
      return {
        flatRows: suggestions.map((s) => ({ kind: "ai" as const, suggestion: s })) as SearchDropdownRow[],
        sections: null as { title: string; rows: InvestorTypeaheadRow[] }[] | null,
      };
    }
    const q = investorSearchTrim.toLowerCase();

    type ScoredFirm = {
      kind: "firm";
      id: string;
      name: string;
      subtitle: string;
      logoUrl: string | null;
      websiteUrl: string | null;
      score: number;
    };
    type ScoredPerson = {
      kind: "person";
      id: string;
      name: string;
      subtitle: string;
      firmId: string;
      score: number;
    };

    const firmsScored: ScoredFirm[] = [];
    for (const f of vcFirms) {
      const score = nameMatchScore(f.name, q);
      if (score < 0) continue;
      firmsScored.push({
        kind: "firm",
        id: f.id,
        name: f.name,
        subtitle: [f.stages?.slice(0, 2).join(", "), f.aum].filter(Boolean).join(" · ") || "Investor",
        logoUrl: f.logo_url ?? null,
        websiteUrl: f.website_url ?? null,
        score,
      });
    }
    firmsScored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const peopleScored: ScoredPerson[] = [];
    for (const p of vcPeople) {
      const score = nameMatchScore(p.full_name, q);
      if (score < 0) continue;
      const firm = firmMap.get(p.firm_id);
      peopleScored.push({
        kind: "person",
        id: p.id,
        name: p.full_name,
        subtitle: firm?.name ?? "Partner",
        firmId: p.firm_id,
        score,
      });
    }
    peopleScored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const toRow = (r: ScoredFirm | ScoredPerson): InvestorTypeaheadRow =>
      r.kind === "firm"
        ? {
            kind: "firm",
            id: r.id,
            name: r.name,
            subtitle: r.subtitle,
            logoUrl: r.logoUrl,
            websiteUrl: r.websiteUrl,
          }
        : { kind: "person", id: r.id, name: r.name, subtitle: r.subtitle, firmId: r.firmId };

    const combined: (ScoredFirm | ScoredPerson)[] = [...firmsScored, ...peopleScored];
    combined.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const picked = new Set<string>();
    const mostRelated: InvestorTypeaheadRow[] = [];
    for (const r of combined) {
      if (mostRelated.length >= MOST_RELATED_CAP) break;
      const key = `${r.kind}:${r.id}`;
      if (picked.has(key)) continue;
      picked.add(key);
      mostRelated.push(toRow(r));
    }

    const firmsRest = firmsScored
      .filter((f) => !picked.has(`firm:${f.id}`))
      .slice(0, MAX_PER_SECTION)
      .map(toRow);
    const peopleRest = peopleScored
      .filter((p) => !picked.has(`person:${p.id}`))
      .slice(0, MAX_PER_SECTION)
      .map(toRow);

    const sections: { title: string; rows: InvestorTypeaheadRow[] }[] = [
      { title: "Most related", rows: mostRelated },
      { title: "Firms", rows: firmsRest },
      { title: "People", rows: peopleRest },
    ].filter((s) => s.rows.length > 0);

    const flatRows: SearchDropdownRow[] = sections.flatMap((s) => s.rows);
    return { flatRows, sections };
  }, [isInvestorArea, investorSearchTrim, suggestions, vcFirms, vcPeople, firmMap]);

  const searchDropdownRows = investorTypeahead.flatRows;

  useEffect(() => {
    setHighlightIdx(0);
  }, [investorSearchTrim, searchOpen]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (onOpenCommandPalette) {
          onOpenCommandPalette();
        } else {
          setSearchOpen(o => !o);
          setHighlightIdx(0);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenCommandPalette]);

  // Keyboard navigation for search dropdown (Esc, Enter, Arrow keys)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      const len = searchDropdownRows.length;
      if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
        setHighlightIdx(0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightIdx((i) => (i < len - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightIdx((i) => (i > 0 ? i - 1 : len - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const q = (investorSearchQuery || "").trim();
        const row = searchDropdownRows[highlightIdx];
        if (row?.kind === "ai") {
          onInvestorSuggestionSelect?.(row.suggestion);
        } else if (row && (row.kind === "firm" || row.kind === "person")) {
          const pick = buildInvestorDirectoryPick(row, firmMap);
          onInvestorSearchQueryChange?.(pick.filterQuery);
          onInvestorDirectoryPick?.(pick);
        } else if (q) {
          onInvestorSearchQueryChange?.(investorSearchQuery || "");
        }
        setSearchOpen(false);
        setHighlightIdx(0);
        onOpenCommandPalette?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    searchOpen,
    searchDropdownRows,
    highlightIdx,
    investorSearchQuery,
    onOpenCommandPalette,
    onInvestorSearchQueryChange,
    onInvestorDirectoryPick,
    firmMap,
    onInvestorSuggestionSelect,
  ]);

  const viewMeta = VIEW_META[activeView] || VIEW_META.dashboard;
  const isCommunityArea = ["network", "groups", "events"].includes(activeView);

  const marketIntelActiveId: ViewType =
    activeView && MARKET_INTEL_SEGMENT_IDS.has(activeView) ? activeView : "market-intelligence";
  const PulseIcon = pulse.icon;

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setSearchOpen(false);
      setHighlightIdx(0);
      onInvestorSuggestionSelect?.(suggestion);
      onOpenCommandPalette?.();
    },
    [onInvestorSuggestionSelect, onOpenCommandPalette]
  );

  const handleTypeaheadPick = useCallback(
    (row: InvestorTypeaheadRow) => {
      setSearchOpen(false);
      setHighlightIdx(0);
      const pick = buildInvestorDirectoryPick(row, firmMap);
      onInvestorSearchQueryChange?.(pick.filterQuery);
      onInvestorDirectoryPick?.(pick);
    },
    [onInvestorSearchQueryChange, onInvestorDirectoryPick, firmMap],
  );

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-2 transition-all duration-300",
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent border-b border-transparent"
      )}
      style={{ left: "200px" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* ── Left: Pulse ── */}
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          {(isInvestorArea || isCommunityArea) ? (
            <button
              key={pulse.text}
              type="button"
              onClick={handlePulseClick}
              aria-label={`Open: ${pulse.text}`}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 -mx-1 text-left text-[11px] font-medium",
                "animate-fade-in transition-colors",
                "cursor-pointer hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <PulseIcon className={cn("h-3 w-3 shrink-0", pulse.color)} />
                <span className="hidden truncate text-muted-foreground xl:inline">{pulse.text}</span>
              </span>
            </button>
          ) : lastSyncedAt ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Clock className="h-3 w-3 text-muted-foreground/50" />
              <span className={cn("hidden truncate transition-colors duration-500 xl:inline", syncFlash ? "text-success" : "text-muted-foreground/70")}>
                {syncFlash ? "Analyzed just now" : `Last analyzed ${relativeTime || ""}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Search ── */}
        <div ref={searchRef} className={cn("relative transition-all duration-300", searchOpen ? "min-w-[220px] flex-1 max-w-4xl" : "")}>
          <button
            onClick={handleSearchClick}
            className={cn(
              "group flex h-9 cursor-text items-center gap-2.5 rounded-xl border bg-muted/30 pl-3.5 pr-3 transition-all hover:bg-muted/50",
              searchOpen
                ? "w-full border-accent/40 bg-muted/50 shadow-sm"
                : "w-9 border-border/50 hover:border-border justify-center"
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/70" />
            {searchOpen && (
              <>
                <span className="flex-1 truncate text-left text-[13px] text-muted-foreground/40">
                  Search...
                </span>
                <kbd className="hidden items-center rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/40 sm:inline-flex">
                  ⌘K
                </kbd>
              </>
            )}
          </button>

          {searchOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 animate-scale-in overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-2xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-4 py-2.5">
                <span className="mr-0.5 shrink-0 text-[10px] font-medium text-muted-foreground/60">I'm looking for</span>
                {FILTER_CHIPS.map(chip => {
                  const Icon = chip.icon;
                  const isActive = activeChip === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => {
                        setActiveChip(chip.id);
                        onInvestorSearchChipChange?.(chip.id);
                      }}
                      className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                        isActive
                          ? "border-accent/20 bg-accent/15 text-accent shadow-sm"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <div className="border-b border-border/40 px-4 py-2.5">
                <input
                  type="text"
                  placeholder="Search investors, firms…"
                  value={investorSearchQuery || ""}
                  onChange={(e) => onInvestorSearchQueryChange?.(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/45 focus:border-accent/35 focus:bg-background focus:ring-2 focus:ring-accent/10"
                  autoFocus
                />
              </div>

              <div className="max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain px-2 py-1">
                {isInvestorArea && investorSearchTrim ? (
                  <>
                    {searchDropdownRows.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No investors match &ldquo;{investorSearchTrim}&rdquo;.
                      </p>
                    ) : (
                      (() => {
                        let rowIndex = 0;
                        return investorTypeahead.sections?.map((section) => (
                          <div
                            key={section.title}
                            className="border-t border-border/35 pt-3 pb-1 first:border-t-0 first:pt-2"
                          >
                            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                              {section.title}
                            </p>
                            <div className="flex flex-col gap-0.5">
                              {section.rows.map((row) => {
                                const i = rowIndex++;
                                return (
                                  <button
                                    key={`${section.title}-${row.kind}-${row.id}`}
                                    type="button"
                                    onClick={() => handleTypeaheadPick(row)}
                                    onMouseEnter={() => setHighlightIdx(i)}
                                    className={cn(
                                      "group/item flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                                      i === highlightIdx
                                        ? "bg-accent/12 text-foreground"
                                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                    )}
                                  >
                                    {row.kind === "firm" ? (
                                      <FirmLogo
                                        firmName={row.name}
                                        logoUrl={row.logoUrl}
                                        websiteUrl={row.websiteUrl}
                                        size="sm"
                                        className="h-9 w-9 shrink-0 rounded-full border border-border/50 bg-background"
                                      />
                                    ) : (
                                      <div
                                        className={cn(
                                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 text-[10px] font-bold",
                                          i === highlightIdx
                                            ? "bg-accent/15 text-accent"
                                            : "bg-muted/80 text-muted-foreground",
                                        )}
                                      >
                                        {personInitials(row.name)}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <span className="block line-clamp-1 text-[13px] leading-snug">
                                        <HighlightedName text={row.name} query={investorSearchTrim} />
                                      </span>
                                      <span className="mt-0.5 block line-clamp-1 text-[11px] leading-snug text-muted-foreground">
                                        {row.subtitle}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 px-1 pb-2">
                      <Sparkles className="h-3 w-3 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                        AI Suggestions
                      </span>
                    </div>
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setHighlightIdx(i)}
                        className={cn(
                          "group/item flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                          i === highlightIdx
                            ? "bg-accent/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            i === highlightIdx ? "bg-accent/20" : "bg-muted/60",
                          )}
                        >
                          <Sparkles
                            className={cn(
                              "h-4 w-4",
                              i === highlightIdx ? "text-accent" : "text-muted-foreground/60",
                            )}
                          />
                        </div>
                        <span className="flex-1 text-sm">{suggestion}</span>
                        <span className="text-[10px] italic opacity-0 transition-opacity text-muted-foreground/40 group-hover/item:opacity-100">
                          try this
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono">↵</kbd> Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono">esc</kbd> Close
                  </span>
                </div>
                <span className="text-[9px] font-mono text-muted-foreground/30">
                  {isInvestorArea && investorSearchTrim ? "Directory" : "Contextual · AI"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Investor directory segmented control (visible when search collapsed) ── */}
        {!searchOpen && ["investors", "investor-search", "directory"].includes(activeView) && (
          <>
            <div className="hidden md:flex shrink-0 items-center pl-2 pr-2">
              <TopNavSegmentedControl
                segments={INVESTOR_DIRECTORY_SEGMENTS}
                activeId={activeView as "investors" | "investor-search" | "directory"}
                onSelect={(v) => routeView(v)}
                ariaLabel="Investor directory view"
                widthClassName="w-[236px] sm:w-[244px]"
              />
            </div>

            {/* Narrow screens: same IA, compact menu trigger aligned with segmented chrome */}
            <div className="md:hidden shrink-0 pl-1.5 pr-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(TOP_NAV_MOBILE_SECTION_TRIGGER, "max-w-[9.5rem]")}>
                    <span className="min-w-0 flex-1 truncate text-left uppercase">
                      {activeView === "investors"
                        ? "All"
                        : activeView === "investor-search"
                          ? "Investors"
                          : "Operators"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuItem
                    onClick={() => routeView("investors")}
                    className={cn(activeView === "investors" && "bg-accent/10 text-accent")}
                  >
                    ALL
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("investor-search")}
                    className={cn(activeView === "investor-search" && "bg-accent/10 text-accent")}
                  >
                    INVESTORS
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("directory")}
                    className={cn(activeView === "directory" && "bg-accent/10 text-accent")}
                  >
                    OPERATORS
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {/* ── Community (Network) — same segmented chrome as investor directory ── */}
        {!searchOpen && ["network", "groups", "events"].includes(activeView) && (
          <>
            <div className="hidden md:flex shrink-0 items-center pl-2 pr-2">
              <TopNavSegmentedControl
                segments={COMMUNITY_SEGMENTS}
                activeId={activeView}
                onSelect={(id) => routeView(id)}
                ariaLabel="Community view"
                widthClassName="w-[248px] sm:w-[264px]"
                labelTransform="none"
              />
            </div>
            <div className="md:hidden shrink-0 pl-1.5 pr-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(TOP_NAV_MOBILE_SECTION_TRIGGER, "max-w-[10rem]")}>
                    <span className="min-w-0 flex-1 truncate text-left normal-case text-[11px] font-semibold tracking-normal">
                      {activeView === "network" ? "Overview" : activeView === "groups" ? "Groups" : "Events"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => routeView("network")}
                    className={cn(activeView === "network" && "bg-accent/10 text-accent")}
                  >
                    Overview
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("groups")}
                    className={cn(activeView === "groups" && "bg-accent/10 text-accent")}
                  >
                    Groups
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("events")}
                    className={cn(activeView === "events" && "bg-accent/10 text-accent")}
                  >
                    Events
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {/* ── Pulse (`/intelligence`) — Brief, Category, Funding, Regulatory, Customer, M&A ── */}
        {!searchOpen && location.pathname === "/intelligence" && (
          <>
            <div className="hidden min-w-0 max-w-full flex-1 shrink md:flex md:items-center md:pl-2 md:pr-2">
              <TopNavSegmentedControl
                segments={MARKET_INTEL_SEGMENTS}
                activeId={marketIntelActiveId}
                onSelect={(id) => routeView(id as ViewType)}
                ariaLabel="Market intelligence views"
                density="compact"
                labelTransform="none"
                segmentLayout="hug"
              />
            </div>

            <div className="md:hidden shrink-0 pl-1.5 pr-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(TOP_NAV_MOBILE_SECTION_TRIGGER, "max-w-[11rem]")}>
                    <span className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold tracking-normal normal-case">
                      {pulseIntelActiveLabel(marketIntelActiveId)}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {MARKET_INTEL_SEGMENTS.map((seg) => (
                    <DropdownMenuItem
                      key={seg.id}
                      onClick={() => routeView(seg.id)}
                      className={cn(activeView === seg.id && "bg-accent/10 text-accent")}
                    >
                      {seg.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {/* ── Raise (home): Data Room only when not on /intelligence */}
        {!searchOpen &&
          location.pathname === "/" &&
          (activeView === "market-investors" || activeView === "market-data-room") && (
          <>
            <div className="hidden min-w-0 max-w-full flex-1 shrink md:flex md:items-center md:pl-2 md:pr-2">
              <TopNavSegmentedControl<ViewType>
                segments={RAISE_SEGMENTS}
                activeId={activeView}
                onSelect={(id) => routeView(id)}
                ariaLabel="Raise — Data Room"
                widthClassName="min-w-[120px] w-auto"
                labelTransform="none"
              />
            </div>
            <div className="md:hidden shrink-0 pl-1.5 pr-1.5">
              <button
                type="button"
                onClick={() => routeView("market-data-room")}
                className={cn(TOP_NAV_MOBILE_SECTION_TRIGGER, "max-w-[10rem]")}
                aria-label="Open Data Room"
                aria-current={activeView === "market-data-room" ? "page" : undefined}
              >
                <span className="min-w-0 flex-1 truncate text-left normal-case text-[11px] font-semibold tracking-normal">
                  Data Room
                </span>
              </button>
            </div>
          </>
        )}

        {/* ── Mission Control — segmented control (matches Network directory chrome) */}
        {!searchOpen &&
          ["dashboard", "industry", "competitive", "competitors", "sector"].includes(activeView) && (
          <>
            <div className="hidden min-w-0 max-w-full flex-1 shrink md:flex md:items-center md:pl-2 md:pr-2">
              <TopNavSegmentedControl
                segments={MISSION_CONTROL_SEGMENTS}
                activeId={activeView}
                onSelect={(id) => routeView(id as ViewType)}
                ariaLabel="Mission control view"
                density="compact"
                labelTransform="none"
                segmentLayout="hug"
              />
            </div>

            <div className="md:hidden shrink-0 pl-1.5 pr-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(TOP_NAV_MOBILE_SECTION_TRIGGER, "max-w-[11rem]")}>
                    <span className="min-w-0 flex-1 truncate text-left normal-case text-[11px] font-semibold tracking-normal">
                      {activeView === "dashboard"
                        ? "Company"
                        : activeView === "industry"
                          ? "Industry"
                          : activeView === "competitive"
                            ? "Competitive"
                            : activeView === "competitors"
                              ? "Competitors"
                              : activeView === "sector"
                                ? "Sector"
                                : "Company"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => routeView("dashboard")}
                    className={cn(activeView === "dashboard" && "bg-accent/10 text-accent")}
                  >
                    Company
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("industry")}
                    className={cn(activeView === "industry" && "bg-accent/10 text-accent")}
                  >
                    Industry
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("competitive")}
                    className={cn(activeView === "competitive" && "bg-accent/10 text-accent")}
                  >
                    Competitive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("competitors")}
                    className={cn(activeView === "competitors" && "bg-accent/10 text-accent")}
                  >
                    Competitors
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("sector")}
                    className={cn(activeView === "sector" && "bg-accent/10 text-accent")}
                  >
                    Sector
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
        <div className="h-4 w-px shrink-0 bg-border/40" />

        <TooltipProvider delayDuration={200}>
          <div className="hidden md:flex shrink-0 items-center gap-4">
            {(() => {
              const locked = profileCompletion < 100 || personalCompletion < 100;
              const views = 12;
              const searches = 85;
              return (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center gap-1.5">
                        <Eye className="h-4 w-4 text-muted-foreground/60" />
                        {locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/40" />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{views}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {locked ? "Complete your personal and company profiles to unlock Investor Views" : `${views} Total Investor Views this week`}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center gap-1.5">
                        <Radar className="h-4 w-4 text-muted-foreground/60" />
                        {locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/40" />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{searches}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {locked ? "Complete your personal and company profiles to unlock Search Appearances" : `${searches} Search Appearances this week`}
                    </TooltipContent>
                  </Tooltip>
                </>
              );
            })()}
          </div>
        </TooltipProvider>

        <div className="hidden md:block h-4 w-px shrink-0 bg-border/40" />

        {autosaveStatus !== "idle" && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex shrink-0 items-center gap-1">
                  {autosaveStatus === "saving" && (
                    <Cloud className="h-3.5 w-3.5 animate-pulse text-muted-foreground/60" />
                  )}
                  {autosaveStatus === "saved" && (
                    <CheckCircle2 className="h-3.5 w-3.5 animate-fade-in text-success" />
                  )}
                  {autosaveStatus === "error" && (
                    <WifiOff className="h-3.5 w-3.5 animate-pulse text-destructive" />
                  )}
                  <span
                    className={cn(
                      "hidden text-[9px] font-mono uppercase tracking-wider sm:inline",
                      autosaveStatus === "saving" && "text-muted-foreground/60",
                      autosaveStatus === "saved" && "text-success",
                      autosaveStatus === "error" && "text-destructive",
                    )}
                  >
                    {autosaveStatus === "saving" ? "Saving" : autosaveStatus === "saved" ? "Saved" : "Offline"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {autosaveStatus === "saving" ? "Saving changes..." : autosaveStatus === "saved" ? "All changes saved" : "Changes not saved — will retry"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="h-4 w-px shrink-0 bg-border/40" />

        <TopNavCompanyHealth
          score={analysisResult?.healthScore}
          stage={userStage}
          sector={userSector}
          activeView={activeView}
          analysisResult={analysisResult}
          companyName={companyName}
          logoUrl={logoUrl}
          hasProfile={hasProfile}
        />

        {/* ── Right: Help + Persona Switcher ── */}
        <div className="flex shrink-0 items-center gap-4">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onViewChange?.("help")}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Help Center</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer shrink-0">
            <div className="relative w-7 h-7 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl && !logoImgError ? (
                <img key={logoUrl} src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" onError={() => setLogoImgError(true)} />
              ) : hasProfile ? (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {companyName?.charAt(0).toUpperCase() || "?"}
                </span>
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0">
            {/* Active Workspace Header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative w-9 h-9 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl && !logoImgError ? (
                  <img key={logoUrl} src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" onError={() => setLogoImgError(true)} />
                ) : hasProfile ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    {companyName?.charAt(0).toUpperCase() || "?"}
                  </span>
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {hasProfile ? companyName : "My Company"}
                </p>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground mt-0.5">
                  {userStage || "Seed"}
                </span>
              </div>
            </div>

            {/* Combined Profile Strength */}
            <button
              onClick={() => {
                const fromIntel = location.pathname === "/intelligence";
                if (fromIntel) navigate("/");
                const url = new URL(fromIntel ? `${window.location.origin}/` : window.location.href);
                url.searchParams.set("view", "settings");
                url.searchParams.set("tab", "account");
                window.history.replaceState({}, "", url.toString());
                onViewChange?.("settings" as ViewType);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                  Profile {Math.round((profileCompletion + personalCompletion) / 2)}% Complete
                </p>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full rounded-l-full bg-accent/60 transition-all"
                    style={{ width: `${personalCompletion / 2}%` }}
                  />
                  <div
                    className="h-full rounded-r-full bg-accent transition-all"
                    style={{ width: `${profileCompletion / 2}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground/50">Personal</span>
                  <span className="text-[9px] text-muted-foreground/50">Company</span>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>

            {/* Divider */}
            <div className="border-b border-border/50" />

            {/* Navigation Menu Items */}
            <div className="p-1">
              {([
                { key: "personal", label: "Personal", icon: User, tab: "account" },
                { key: "company", label: "Company", icon: Building2, tab: "company" },
                { key: "network", label: "Network", icon: Radio, tab: "network" },
                { key: "preferences", label: "Preferences", icon: SlidersHorizontal, tab: "notifications" },
                { key: "subscription", label: "Subscription", icon: CreditCard, tab: "subscription" },
                { key: "acct", label: "Account", icon: Settings2, tab: "security" },
              ] as const).map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  onClick={() => {
                    const fromIntel = location.pathname === "/intelligence";
                    if (fromIntel) navigate("/");
                    const url = new URL(fromIntel ? `${window.location.origin}/` : window.location.href);
                    url.searchParams.set("view", "settings");
                    url.searchParams.set("tab", item.tab);
                    window.history.replaceState({}, "", url.toString());
                    onViewChange?.("settings" as ViewType);
                  }}
                  className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide cursor-pointer"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              <div className="border-t border-border/50 my-1" />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </div>
  );
}
