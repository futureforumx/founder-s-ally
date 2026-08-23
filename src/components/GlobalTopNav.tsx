import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { ConfigProvider, Menu, theme as antdTheme } from "antd";
import type { MenuProps } from "antd";
import {
  Building2, Search, ChevronDown, Zap, TrendingUp,
  Activity, Radio, Clock, Sparkles, ListFilter, Star, Flame, Users,
  X, Eye, Radar, Lock, CircleHelp, Cloud, CheckCircle2, WifiOff,
  Sun, Moon,
  type LucideIcon,
} from "lucide-react";
import { useAutosaveStatus, type AutosaveStatus } from "@/hooks/useAutosave";
import { cn, safeTrim } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NETWORK_SURFACE_DISPLAY_NAME } from "@/lib/networkNavVariant";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";
import { TopNavCompanyHealth } from "@/components/health/TopNavCompanyHealth";
import type { AnalysisResult } from "@/components/company-profile/types";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { useInvestorDirectory, mapDbInvestor } from "@/hooks/useInvestorDirectory";
import { isSupabaseConfigured, supabaseVcDirectory } from "@/integrations/supabase/client";
import { normalizeForFirmSearch, personDisplayNameMatchesQuery } from "@/lib/firmSearchNormalize";
import { rpcSearchFirmInvestors, rpcSearchFirmRecords } from "@/lib/firmSearchRpc";
import { FirmLogo } from "@/components/ui/firm-logo";
import { collapseStagesToRangePreferringSpecificOverEarly } from "@/lib/stageUtils";
import { applyTheme, readStoredTheme, toggleTheme, type AppTheme } from "@/lib/theme";
import { VEKTA_OPEN_QUICK_ACTIONS_EVENT } from "@/lib/appShellNavigate";

type ViewType =
  | "home"
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
  | "settings"
  | "profile-workspace"
  | "targeting"
  | "circles"
  | "integrations";

interface GlobalTopNavProps {
  companyName?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
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
  home: { section: "Home", label: "Start" },
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
  investors: { section: "Workspace", label: "MATCHES", siblings: [
    { id: "investor-search", label: "INVESTORS" },
    { id: "investor-funding", label: "FUNDING" },
    { id: "investor-trending", label: "TRENDING" },
  ]},
  "investor-search": { section: "Research", label: "INVESTORS", siblings: [
    { id: "investors", label: "MATCHES" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "investor-funding", label: "FUNDING" },
    { id: "investor-trending", label: "TRENDING" },
  ]},
  "investor-funding": { section: "Research", label: "FUNDING", siblings: [
    { id: "investors", label: "MATCHES" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "investor-funding", label: "FUNDING" },
    { id: "investor-trending", label: "TRENDING" },
  ]},
  "investor-trending": { section: "Research", label: "TRENDING", siblings: [
    { id: "investors", label: "MATCHES" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "investor-funding", label: "FUNDING" },
    { id: "investor-trending", label: "TRENDING" },
  ]},
  "network-workspace": { section: "Network", label: "Workspace" },
  targeting: {
    section: "Execution",
    label: "Targeting",
    siblings: [
      { id: "targeting", label: "Targeting" },
      { id: "circles", label: "Circles" },
    ],
  },
  circles: {
    section: "Execution",
    label: "Circles",
    siblings: [
      { id: "targeting", label: "Targeting" },
      { id: "circles", label: "Circles" },
    ],
  },
  directory: { section: NETWORK_SURFACE_DISPLAY_NAME, label: "Overview", siblings: [
    { id: "network", label: "Market" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Funding" },
    { id: "market-trending", label: "Trending" },
  ]},
  connections: { section: NETWORK_SURFACE_DISPLAY_NAME, label: "Connection" },
  network: { section: NETWORK_SURFACE_DISPLAY_NAME, label: "Market" },
  groups: { section: "Community", label: "Groups", siblings: [
    { id: "network", label: "Market" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Funding" },
    { id: "market-trending", label: "Trending" },
  ]},
  events: { section: "Community", label: "Funding", siblings: [
    { id: "network", label: "Market" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Funding" },
    { id: "market-trending", label: "Trending" },
  ]},
  "market-trending": { section: "Research", label: "Trending", siblings: [
    { id: "network", label: "Market" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Funding" },
    { id: "market-trending", label: "Trending" },
  ]},
  messages: { section: "Community", label: "Messages" },
  "market-intelligence": { section: "Activity", label: "Brief" },
  "market-category": { section: "Activity", label: "Category" },
  "market-funding": { section: "Activity", label: "Funding" },
  "market-regulatory": { section: "Activity", label: "Regulatory" },
  "market-customer": { section: "Activity", label: "Customer" },
  "market-ma": { section: "Activity", label: "M&A / Strategic Moves" },
  "market-investors": { section: "Raise", label: "Investors" },
  "market-market": { section: "Activity", label: "Category" },
  "market-tech": { section: "Activity", label: "Funding" },
  "market-network": { section: "Activity", label: "M&A / Strategic Moves" },

  resources: { section: "Resources", label: "Help Center" },
  settings: { section: "Settings", label: "Settings" },
  "profile-workspace": { section: "Settings", label: "Profile & Workspace" },
  integrations: { section: "Integrations", label: "Data connections" },
};

// ── Contextual AI suggestions per view ──
function getContextSuggestions(view: ViewType, sector?: string | null, stage?: string | null): string[] {
  const s = safeTrim(sector) || "Technology";
  const st = safeTrim(stage) || "Seed";
  switch (view) {
    case "investor-search":
    case "investors":
      return [
        `Lead ${s} investors`,
        `Top ${s} funds actively deploying`,
        `Investors writing ${st} checks`,
      ];
    case "investor-funding":
    case "events":
      return [
        `${s} startups that raised this month`,
        `Latest ${st} venture rounds`,
        "Funds leading two deals in the same week",
      ];
    case "investor-trending":
    case "market-trending":
      return [
        `${s} startups with the highest 24h velocity`,
        "Who is trending before a priced round",
        "Early-spotter names in my category",
      ];
    case "connections":
      return [
        "Warm intros through shared investors",
        `${s} investors in my network`,
        "Recently connected funds",
      ];
    case "network-workspace":
    case "targeting":
    case "circles":
      return [
        "Who should I ask for a warm intro this week?",
        "Strongest 2-hop paths to Seed funds in my space",
        "Which signals mean I should move now vs wait",
      ];
    case "network":
    case "directory":
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
  { id: "all", label: "Investors", icon: ListFilter },
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

/** Passed when user picks a firm or person in investor typeahead so the directory can open the firm card. */
export type InvestorDirectoryPick = {
  vcFirmId: string;
  /** Applied to the investor grid text filter (firm name; for people, their fund name). */
  filterQuery: string;
  /** When the pick is a partner/person row, open their profile instead of only the firm. */
  personId?: string;
};

function buildInvestorDirectoryPick(
  row: InvestorTypeaheadRow,
  firmMap: Map<string, { name: string }>,
): InvestorDirectoryPick {
  if (row.kind === "firm") {
    return { vcFirmId: row.id, filterQuery: row.name };
  }
  const firmName = firmMap.get(row.firmId)?.name || row.subtitle || row.name;
  return { vcFirmId: row.firmId, filterQuery: firmName, personId: row.id };
}

const MOST_RELATED_CAP = 5;
const MAX_PER_SECTION = 25;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match CommunityView `normalizeFirmName` — dedupe MDM firms vs live `firm_records`. */
function normalizeFirmNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/** Higher = better match for ranking “most related”. */
function nameMatchScore(name: string | null | undefined, qLower: string): number {
  const n = String(name ?? "")
    .toLowerCase()
    .trim();
  if (!n || !qLower || !n.includes(qLower)) return -1;
  if (n === qLower) return 1000;
  if (n.startsWith(qLower)) return 800;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(qLower))) return 650;
  const idx = n.indexOf(qLower);
  if (idx === 0) return 800;
  if (idx > 0 && (n[idx - 1] === " " || n[idx - 1] === "-" || n[idx - 1] === "/")) return 550;
  return 400;
}

function firmSearchDedupeKey(displayName: string): string {
  return normalizeForFirmSearch(displayName, true).replace(/\s+/g, "");
}

/** Firm display names: substring score, then normalized match (aliases / “seven 11” ↔ “7 eleven”). */
function firmNameMatchScore(name: string | null | undefined, qLower: string): number {
  const base = nameMatchScore(name, qLower);
  if (base >= 0) return base;
  const qn = normalizeForFirmSearch(qLower, true);
  const nn = normalizeForFirmSearch(name, true);
  if (!qn || !nn) return -1;
  if (nn === qn) return 920;
  if (nn.startsWith(qn) || qn.startsWith(nn)) return 880;
  if (nn.includes(qn) || qn.includes(nn)) return 700;
  return -1;
}

/** Person names: substring score, then same normalization rules without corporate suffix stripping. */
function personNameMatchScore(fullName: string | null | undefined, qLower: string): number {
  const base = nameMatchScore(fullName, qLower);
  if (base >= 0) return base;
  if (!personDisplayNameMatchesQuery(fullName, qLower)) return -1;
  const qn = normalizeForFirmSearch(qLower, false);
  const nn = normalizeForFirmSearch(fullName, false);
  if (nn === qn) return 920;
  if (nn.includes(qn) || qn.includes(nn)) return 720;
  return 520;
}

function personInitials(name: string): string {
  const parts = safeTrim(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function stageSubtitleRange(stages: readonly string[] | null | undefined): string | null {
  if (!stages?.length) return null;
  return collapseStagesToRangePreferringSpecificOverEarly(stages) ?? null;
}

function HighlightedName({ text, query }: { text: string; query: string }) {
  const q = safeTrim(query);
  if (!q) return <span className="font-medium text-foreground">{text}</span>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = String(text ?? "").split(re);
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
  { text: "12 New Seed Rounds Today", icon: Zap, color: "text-emerald-500", nav: { kind: "intel", view: "market-funding" } },
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

const INVESTOR_DIRECTORY_SEGMENTS: { id: "investor-search" | "investor-funding" | "investor-trending"; label: string }[] = [
  { id: "investor-search", label: "Investors" },
  { id: "investor-funding", label: "Funding" },
  { id: "investor-trending", label: "Trending" },
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

const COMMUNITY_SEGMENTS: { id: "network" | "groups" | "events" | "market-trending"; label: string }[] = [
  { id: "network", label: "Overview" },
  { id: "groups", label: "Groups" },
  { id: "events", label: "Funding" },
  { id: "market-trending", label: "Trending" },
];

/**
 * Horizontal Ant Design Menu — same instrument as https://ant.design/components/menu#menu-demo-horizontal
 */
function TopNavMenu<T extends string>({
  segments,
  activeId,
  onSelect,
  ariaLabel,
  allowOverflow = false,
  appearance = "light",
}: {
  segments: readonly { id: T; label: string }[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  allowOverflow?: boolean;
  appearance?: "light" | "dark";
}) {
  const items = useMemo<MenuProps["items"]>(
    () => segments.map((seg) => ({ key: seg.id, label: seg.label })),
    [segments],
  );

  return (
    <Menu
      mode="horizontal"
      theme={appearance}
      selectable
      selectedKeys={[activeId]}
      items={items}
      onClick={({ key }) => onSelect(key as T)}
      aria-label={ariaLabel}
      disabledOverflow={!allowOverflow}
      overflowedIndicator={<ChevronDown className="h-3.5 w-3.5" aria-hidden />}
      className="vekta-top-nav-menu"
      style={{ background: "transparent", borderBottom: "none", lineHeight: 36, minWidth: 0 }}
    />
  );
}

export function GlobalTopNav({
  companyName,
  logoUrl,
  websiteUrl,
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
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("light") ? "light" : "dark";
    }
    return readStoredTheme();
  });
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeChip, setActiveChip] = useState("all");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const pulse = useRotatingPulse();

  const autosaveStatus = useAutosaveStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const antdThemeConfig = useMemo(
    () => ({
      algorithm: theme === "light" ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm,
      token: {
        colorPrimary: "#5B5CFF",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        borderRadius: 8,
      },
      components: {
        Menu: {
          itemBg: "transparent",
          itemHoverBg: "transparent",
          itemSelectedBg: "transparent",
          itemSelectedColor: "#5B5CFF",
          horizontalItemSelectedBg: "transparent",
          horizontalItemSelectedColor: "#5B5CFF",
          horizontalLineHeight: "36px",
          itemPaddingInline: 14,
          activeBarHeight: 2,
        },
      },
    }),
    [theme],
  );

  const routeView = useCallback(
    (v: ViewType) => {
      const resolved = v === "data-room" ? ("market-data-room" as ViewType) : v;
      const intel = MARKET_INTEL_SEGMENT_IDS.has(resolved);
      if (resolved === "investor-search" || resolved === "investor-funding" || resolved === "investor-trending") {
        onInvestorSearchChipChange?.("all");
        onInvestorSearchQueryChange?.("");
      } else if (resolved === "directory") {
        onInvestorSearchQueryChange?.("");
      }
      if (intel) {
        if (location.pathname !== "/intelligence") navigate("/intelligence");
      } else if (location.pathname === "/intelligence") {
        navigate("/");
      }
      onViewChange?.(resolved);
      if (resolved === "investors") dispatchInvestorsAllFocus();
    },
    [location.pathname, navigate, onInvestorSearchChipChange, onInvestorSearchQueryChange, onViewChange]
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

  const handleThemeToggle = useCallback(() => {
    const next = toggleTheme(theme);
    applyTheme(next);
    setTheme(next);
  }, [theme]);

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

  const isInvestorArea = ["investors", "investor-search", "investor-funding", "investor-trending"].includes(activeView);
  const { firms: vcFirms, people: vcPeople, firmMap } = useVCDirectory();
  const { data: liveFirmRecords } = useInvestorDirectory();

  const suggestions = useMemo(
    () => getContextSuggestions(activeView, userSector, userStage),
    [activeView, userSector, userStage],
  );
  const investorSearchTrim = safeTrim(investorSearchQuery);

  const navInvestorSearchRpc = useQuery({
    queryKey: ["global-nav-investor-search", investorSearchTrim],
    queryFn: async () => {
      const [firms, people] = await Promise.all([
        rpcSearchFirmRecords(investorSearchTrim, 24, null, supabaseVcDirectory),
        rpcSearchFirmInvestors(investorSearchTrim, 16, supabaseVcDirectory),
      ]);
      return { firms, people };
    },
    enabled: isInvestorArea && investorSearchTrim.length >= 2 && isSupabaseConfigured,
    staleTime: 60_000,
  });

  const investorTypeahead = useMemo(() => {
    if (!isInvestorArea || !investorSearchTrim) {
      return {
        flatRows: suggestions.map((s) => ({ kind: "ai" as const, suggestion: s })) as SearchDropdownRow[],
        sections: null as { title: string; rows: InvestorTypeaheadRow[] }[] | null,
      };
    }
    const q = investorSearchTrim.toLowerCase();
    const rpcFirmsRaw = navInvestorSearchRpc.data?.firms ?? [];
    const rpcPeopleRaw = navInvestorSearchRpc.data?.people ?? [];

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
    const seenFirmDedupe = new Set<string>();

    for (let i = 0; i < rpcFirmsRaw.length; i++) {
      const inv = mapDbInvestor(rpcFirmsRaw[i]);
      if (!inv.id || !inv.name) continue;
      const dk = firmSearchDedupeKey(inv.name);
      if (!dk || seenFirmDedupe.has(dk)) continue;
      seenFirmDedupe.add(dk);
      firmsScored.push({
        kind: "firm",
        id: inv.id,
        name: inv.name,
        subtitle: [inv.sector, inv.aum].filter(Boolean).join(" · ") || "Investor",
        logoUrl: inv.logo_url ?? null,
        websiteUrl: inv.website_url ?? null,
        score: 1550 - i * 6,
      });
    }

    const vcNameKeys = new Set(vcFirms.map((f) => normalizeFirmNameKey(f.name)));

    for (const f of vcFirms) {
      const dk = firmSearchDedupeKey(f.name);
      if (dk && seenFirmDedupe.has(dk)) continue;
      const score = firmNameMatchScore(f.name, q);
      if (score < 0) continue;
      if (dk) seenFirmDedupe.add(dk);
      firmsScored.push({
        kind: "firm",
        id: f.id,
        name: f.name,
        subtitle: [stageSubtitleRange(f.stages), f.aum].filter(Boolean).join(" · ") || "Investor",
        logoUrl: f.logo_url ?? null,
        websiteUrl: f.website_url ?? null,
        score,
      });
    }

    const addedLiveKeys = new Set<string>();
    for (const inv of liveFirmRecords ?? []) {
      const nk = normalizeFirmNameKey(inv.name);
      if (!nk || vcNameKeys.has(nk) || addedLiveKeys.has(nk)) continue;
      const dk = firmSearchDedupeKey(inv.name);
      if (dk && seenFirmDedupe.has(dk)) continue;
      const score = firmNameMatchScore(inv.name, q);
      if (score < 0) continue;
      addedLiveKeys.add(nk);
      if (dk) seenFirmDedupe.add(dk);
      firmsScored.push({
        kind: "firm",
        id: inv.id,
        name: inv.name,
        subtitle: [inv.sector, inv.aum].filter(Boolean).join(" · ") || "Investor",
        logoUrl: inv.logo_url ?? null,
        websiteUrl: inv.website_url ?? null,
        score,
      });
    }

    firmsScored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const seenPersonKeys = new Set<string>();
    const peopleScored: ScoredPerson[] = [];

    for (let i = 0; i < rpcPeopleRaw.length; i++) {
      const hit = rpcPeopleRaw[i]!;
      const pk = `${normalizeForFirmSearch(hit.full_name, false)}|${normalizeForFirmSearch(hit.firm_name, true)}`;
      if (seenPersonKeys.has(pk)) continue;
      seenPersonKeys.add(pk);
      peopleScored.push({
        kind: "person",
        id: String(hit.id),
        name: hit.full_name,
        subtitle: hit.firm_name || "Partner",
        firmId: String(hit.firm_id),
        score: 1540 - i * 6,
      });
    }

    for (const p of vcPeople) {
      const pk = `${normalizeForFirmSearch(p.full_name, false)}|${normalizeForFirmSearch(firmMap.get(p.firm_id)?.name ?? "", true)}`;
      if (seenPersonKeys.has(pk)) continue;
      const score = personNameMatchScore(p.full_name, q);
      if (score < 0) continue;
      seenPersonKeys.add(pk);
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
  }, [
    isInvestorArea,
    investorSearchTrim,
    suggestions,
    vcFirms,
    vcPeople,
    firmMap,
    liveFirmRecords,
    navInvestorSearchRpc.data,
  ]);

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

  useEffect(() => {
    const handler = () => {
      if (onOpenCommandPalette) {
        onOpenCommandPalette();
        return;
      }
      setSearchOpen(true);
      setHighlightIdx(0);
    };
    window.addEventListener(VEKTA_OPEN_QUICK_ACTIONS_EVENT, handler);
    return () => window.removeEventListener(VEKTA_OPEN_QUICK_ACTIONS_EVENT, handler);
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
          setSearchOpen(false);
          setHighlightIdx(0);
          onOpenCommandPalette?.();
        } else if (row && (row.kind === "firm" || row.kind === "person")) {
          const pick = buildInvestorDirectoryPick(row, firmMap);
          onInvestorSearchQueryChange?.(pick.filterQuery);
          onInvestorDirectoryPick?.(pick);
          setSearchOpen(false);
          setHighlightIdx(0);
        } else if (q) {
          onInvestorSearchQueryChange?.(investorSearchQuery || "");
          setSearchOpen(false);
          setHighlightIdx(0);
          onOpenCommandPalette?.();
        }
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
  const isCommunityArea = ["network", "groups", "events", "directory", "market-trending"].includes(activeView);

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
    <ConfigProvider theme={antdThemeConfig}>
    <div
      className={cn(
        "fixed top-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-2",
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent border-b border-transparent"
      )}
      style={{
        left: "var(--app-sidebar-width, 216px)",
        transition:
          "left 320ms cubic-bezier(0.16, 1, 0.3, 1), background-color 300ms ease, border-color 300ms ease, box-shadow 300ms ease, backdrop-filter 300ms ease",
      }}
    >
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", searchOpen && "overflow-visible")}>
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
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
        <div
          ref={searchRef}
          className={cn(
            "relative transition-all duration-300",
            searchOpen ? "z-[60] min-w-[min(100%,28rem)] flex-1 max-w-4xl overflow-visible" : "",
          )}
        >
          {searchOpen ? (
            <div className="group flex h-9 w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-muted/50 pl-3.5 pr-3 shadow-sm transition-all">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/70" />
              <input
                type="text"
                autoFocus
                placeholder="Search investors, firms…"
                value={investorSearchQuery || ""}
                onChange={(e) => onInvestorSearchQueryChange?.(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
              />
              <kbd className="hidden items-center rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/40 sm:inline-flex">
                ⌘K
              </kbd>
            </div>
          ) : (
            <button
              onClick={handleSearchClick}
              className="group flex h-9 w-9 cursor-text items-center justify-center rounded-xl border border-border/50 bg-muted/30 transition-all hover:border-border hover:bg-muted/50"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/70" />
            </button>
          )}

          {searchOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 w-full min-w-0 animate-scale-in overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-2xl backdrop-blur-xl">
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
                                    onMouseDown={(e) => e.preventDefault()}
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
                      <Sparkles className="h-3 w-3 text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80">
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

        {/* ── Investor directory (Ant Design Menu) ── */}
        {!searchOpen && ["investor-search", "investor-funding", "investor-trending"].includes(activeView) && (
          <div className="flex h-9 shrink-0 items-center pl-2 pr-2">
            <TopNavMenu
              appearance={theme}
              segments={INVESTOR_DIRECTORY_SEGMENTS}
              activeId={activeView as "investor-search" | "investor-funding" | "investor-trending"}
              onSelect={(v) => routeView(v)}
              ariaLabel="Investor directory view"
            />
          </div>
        )}

        {/* ── Community (Network) — Ant Design Menu ── */}
        {!searchOpen && ["network", "groups", "events", "directory", "market-trending"].includes(activeView) && (
          <div className="flex h-9 shrink-0 items-center pl-2 pr-2">
            <TopNavMenu
              appearance={theme}
              segments={COMMUNITY_SEGMENTS}
              activeId={activeView === "directory" ? "network" : activeView}
              onSelect={(id) => routeView(id)}
              ariaLabel="Market view"
            />
          </div>
        )}

        {/* ── Pulse (`/intelligence`) — Ant Design Menu ── */}
        {!searchOpen && location.pathname === "/intelligence" && (
          <div className="flex h-9 min-w-0 max-w-full flex-1 items-center pl-2 pr-2">
            <TopNavMenu
              appearance={theme}
              segments={MARKET_INTEL_SEGMENTS}
              activeId={marketIntelActiveId}
              onSelect={(id) => routeView(id)}
              ariaLabel="Market intelligence view"
              allowOverflow
            />
          </div>
        )}

        {/* ── Raise (home): Data Room only when not on /intelligence */}
        {!searchOpen &&
          location.pathname === "/" &&
          (activeView === "market-investors" || activeView === "market-data-room") && (
          <div className="flex h-9 shrink-0 items-center pl-2 pr-2">
            <TopNavMenu
              appearance={theme}
              segments={RAISE_SEGMENTS}
              activeId={activeView}
              onSelect={(id) => routeView(id)}
              ariaLabel="Raise — Data Room"
            />
          </div>
        )}

        {/* ── Mission Control — Ant Design Menu ── */}
        {!searchOpen &&
          ["dashboard", "industry", "competitive", "competitors", "sector"].includes(activeView) && (
          <div className="flex h-9 min-w-0 max-w-full flex-1 items-center pl-2 pr-2">
            <TopNavMenu
              appearance={theme}
              segments={MISSION_CONTROL_SEGMENTS}
              activeId={activeView}
              onSelect={(id) => routeView(id as ViewType)}
              ariaLabel="Mission control view"
              allowOverflow
            />
          </div>
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
          websiteUrl={websiteUrl}
          hasProfile={hasProfile}
          onNavigateToDataRoom={() => routeView("market-data-room")}
        />

        {/* ── Right: Help + Persona Switcher ── */}
        <div className="flex shrink-0 items-center gap-4">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleThemeToggle}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/55 bg-muted/30 text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label={theme === "dark" ? "Switch to light view" : "Switch to dark view"}
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {theme === "dark" ? "Switch to light view" : "Switch to dark view"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

        <button
          type="button"
          onClick={() => {
            if (location.pathname !== "/" || location.search) navigate("/");
            onViewChange?.("home");
          }}
          aria-label="Go to home"
          className="flex shrink-0 cursor-pointer items-center rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted/40"
        >
          <img
            src={theme === "dark" ? "/brand/vekta-nav-mark-dark.png" : "/brand/vekta-nav-mark-light.png"}
            alt=""
            className="h-7 w-7 shrink-0 rounded-lg object-cover"
          />
        </button>
      </div>
      </div>
    </div>
    </ConfigProvider>
  );
}
