import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, Users, Building2, MapPin, Sparkles, Briefcase, Handshake, Layers,
  ArrowRight, Flame, Loader2, LayoutGrid, Zap, TrendingUp } from
"lucide-react";
import { SearchOmnibar, type EntityScope } from "./SearchOmnibar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";
import { FounderCarousel } from "./FounderCarousel";
import { FounderDetailPanel } from "./FounderDetailPanel";
import { InvestorDetailPanel } from "./InvestorDetailPanel";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
  onNavigateProfile?: () => void;
  variant?: "directory" | "investor-search";
}

// ── Types ──
type EntryCategory = "founder" | "investor" | "company";

interface DirectoryEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  initial: string;
  matchReason: string | null;
  category: EntryCategory;
}

// ── Mock data: Suggested ──
const SUGGESTED_ENTRIES: DirectoryEntry[] = [
// Founders
{ name: "Constructiv AI", sector: "Construction & Real Estate", stage: "Seed", description: "AI-powered project management for mid-size contractors. Automates scheduling, risk forecasting, and compliance tracking.", location: "San Francisco, CA", model: "B2B SaaS", initial: "C", matchReason: null, category: "founder" },
{ name: "GridShift Energy", sector: "Climate & Energy", stage: "Series A", description: "Smart grid optimization platform using reinforcement learning to reduce energy waste by 40% for commercial buildings.", location: "Austin, TX", model: "Usage-Based", initial: "G", matchReason: "Matches your stage", category: "founder" },
{ name: "VaultMed", sector: "Health & Biotech", stage: "Pre-Seed", description: "Decentralized health records platform giving patients full ownership of their medical data via zero-knowledge proofs.", location: "Boston, MA", model: "B2B SaaS", initial: "V", matchReason: null, category: "founder" },
{ name: "Mosaic Retail", sector: "Consumer & Retail", stage: "Series B", description: "AI visual merchandising engine for e-commerce brands. Increases conversion by dynamically optimizing product layouts.", location: "New York, NY", model: "Marketplace", initial: "M", matchReason: "Matches your sector", category: "founder" },
// Investors
{ name: "Sequoia Capital", sector: "Multi-stage", stage: "Seed–Growth", description: "Premier venture capital firm backing transformative companies from seed to IPO across technology sectors.", location: "Menlo Park, CA", model: "$1M–$50M", initial: "S", matchReason: "Matches your sector", category: "investor" },
{ name: "Lux Capital", sector: "Deep Tech", stage: "Seed–Series B", description: "Invests in emerging science and technology ventures at the outermost edges of what's possible.", location: "New York, NY", model: "$1M–$25M", initial: "L", matchReason: null, category: "investor" },
{ name: "First Round Capital", sector: "Software & Consumer", stage: "Pre-Seed–Seed", description: "Seed-stage venture firm partnering with founders who are reimagining work, commerce, and daily life.", location: "San Francisco, CA", model: "$500K–$3M", initial: "F", matchReason: "Active in your stage", category: "investor" },
// Companies
{ name: "NovaBuild", sector: "PropTech", stage: "Series A", description: "Modular construction OS that cuts project timelines by 35% through prefab coordination and real-time site analytics.", location: "Denver, CO", model: "B2B SaaS", initial: "N", matchReason: null, category: "company" },
{ name: "Canopy Finance", sector: "Fintech", stage: "Seed", description: "Embedded lending infrastructure for vertical SaaS platforms. Enables any software company to offer credit products.", location: "Miami, FL", model: "B2B SaaS", initial: "C", matchReason: null, category: "company" },
{ name: "Synthara Bio", sector: "Health & Biotech", stage: "Series B", description: "Synthetic biology platform engineering microbes for sustainable textile dyes, replacing petroleum-based chemicals.", location: "Cambridge, MA", model: "Licensing", initial: "S", matchReason: null, category: "company" }];


// ── Mock data: Trending ──
const TRENDING_ENTRIES: DirectoryEntry[] = [
// Founders
{ name: "DefenseKit", sector: "Defense & GovTech", stage: "Seed", description: "Dual-use drone swarm coordination software for search-and-rescue and perimeter defense operations.", location: "Arlington, VA", model: "Licensing", initial: "D", matchReason: null, category: "founder" },
{ name: "QuantumForge", sector: "Deep Tech & Space", stage: "Series A", description: "Quantum computing compiler toolchain that reduces qubit error rates by 60%. Making quantum practical for pharma R&D.", location: "Boulder, CO", model: "B2B SaaS", initial: "Q", matchReason: null, category: "founder" },
{ name: "AeroMind", sector: "Deep Tech & Space", stage: "Pre-Seed", description: "Autonomous satellite constellation management using multi-agent AI for collision avoidance and orbit optimization.", location: "Los Angeles, CA", model: "B2B SaaS", initial: "A", matchReason: null, category: "founder" },
// Investors
{ name: "a16z", sector: "Software & Crypto", stage: "Seed–Growth", description: "Andreessen Horowitz is a venture capital firm that backs bold entrepreneurs building the future.", location: "Menlo Park, CA", model: "$500K–$100M", initial: "A", matchReason: null, category: "investor" },
{ name: "Founders Fund", sector: "Frontier Tech", stage: "Seed–Growth", description: "Peter Thiel's fund investing in revolutionary companies that push the frontier of technology.", location: "San Francisco, CA", model: "$500K–$50M", initial: "F", matchReason: null, category: "investor" },
// Companies
{ name: "ClearPath Logistics", sector: "Supply Chain", stage: "Seed", description: "End-to-end freight visibility platform. Uses IoT + ML to predict delays 72 hours in advance for last-mile carriers.", location: "Chicago, IL", model: "Usage-Based", initial: "C", matchReason: null, category: "company" },
{ name: "Pepper Robotics", sector: "Industrial Automation", stage: "Series A", description: "Cobotic systems for food processing plants. 3x throughput increase with zero added safety incidents.", location: "Pittsburgh, PA", model: "Hardware + SaaS", initial: "P", matchReason: null, category: "company" }];


// ── Extended entries for grid ──
const EXTRA_ENTRIES: DirectoryEntry[] = [
{ name: "Lumen Health", sector: "Health & Biotech", stage: "Seed", description: "Remote patient monitoring platform using wearable biosensors and predictive AI for chronic disease management.", location: "Nashville, TN", model: "B2B SaaS", initial: "L", matchReason: null, category: "founder" },
{ name: "TerraFlow", sector: "Climate & Energy", stage: "Series A", description: "Carbon capture marketplace connecting industrial emitters with verified offset projects using blockchain verification.", location: "Portland, OR", model: "Marketplace", initial: "T", matchReason: "Matches your stage", category: "company" },
{ name: "CodeVault", sector: "Developer Tools", stage: "Pre-Seed", description: "AI-powered code review platform that detects security vulnerabilities and suggests fixes in real-time during PR reviews.", location: "Seattle, WA", model: "B2B SaaS", initial: "C", matchReason: null, category: "company" },
{ name: "FreshRoute", sector: "Supply Chain", stage: "Seed", description: "Cold chain logistics optimizer for perishable goods. Reduces food waste by 25% through dynamic routing and IoT monitoring.", location: "Atlanta, GA", model: "Usage-Based", initial: "F", matchReason: null, category: "company" },
{ name: "Nucleus AI", sector: "Enterprise AI", stage: "Series B", description: "Enterprise knowledge graph platform that unifies siloed data across departments for AI-ready organizational intelligence.", location: "San Jose, CA", model: "B2B SaaS", initial: "N", matchReason: null, category: "founder" },
{ name: "BridgeEd", sector: "EdTech", stage: "Seed", description: "Adaptive learning platform for workforce upskilling. Uses competency mapping to create personalized learning paths.", location: "Washington, DC", model: "B2B SaaS", initial: "B", matchReason: "Matches your sector", category: "founder" },
{ name: "Kleiner Perkins", sector: "Software & Health", stage: "Seed–Growth", description: "Legendary venture firm investing in technology and life science companies driving positive impact.", location: "Menlo Park, CA", model: "$1M–$20M", initial: "K", matchReason: null, category: "investor" },
{ name: "Bessemer Venture Partners", sector: "Cloud & SaaS", stage: "Seed–Growth", description: "One of the oldest VC firms, pioneering cloud computing investments with a century of experience.", location: "San Francisco, CA", model: "$1M–$30M", initial: "B", matchReason: "Active in your sector", category: "investor" },
{ name: "AquaPure Tech", sector: "Climate & Energy", stage: "Series A", description: "Decentralized water purification systems powered by solar energy for off-grid communities and disaster relief.", location: "Phoenix, AZ", model: "Hardware + SaaS", initial: "A", matchReason: null, category: "company" },
{ name: "FleetMind", sector: "Mobility & Logistics", stage: "Pre-Seed", description: "Autonomous fleet management for last-mile delivery using computer vision and edge computing on existing vehicles.", location: "Detroit, MI", model: "Usage-Based", initial: "F", matchReason: null, category: "company" },
{ name: "Vega Legal", sector: "LegalTech", stage: "Seed", description: "AI contract analysis tool that identifies risk clauses and suggests negotiation strategies for in-house legal teams.", location: "Philadelphia, PA", model: "B2B SaaS", initial: "V", matchReason: null, category: "founder" },
{ name: "Bloom Finance", sector: "Fintech", stage: "Pre-Seed", description: "Micro-investment platform for Gen Z that rounds up purchases and invests in curated ESG-focused portfolios.", location: "Brooklyn, NY", model: "Consumer", initial: "B", matchReason: null, category: "company" }];


// ── All entries (combined) ──
const ALL_ENTRIES: DirectoryEntry[] = [...SUGGESTED_ENTRIES, ...TRENDING_ENTRIES, ...EXTRA_ENTRIES];

function filterByScope(entries: DirectoryEntry[], scope: EntityScope): DirectoryEntry[] {
  if (scope === "all") return entries;
  const catMap: Record<string, EntryCategory> = { founders: "founder", investors: "investor", companies: "company" };
  const cat = catMap[scope];
  return entries.filter((e) => e.category === cat);
}

const SCOPE_LABELS: Record<EntityScope, {singular: string;plural: string;}> = {
  all: { singular: "entry", plural: "entries" },
  founders: { singular: "founder", plural: "founders" },
  investors: { singular: "investor", plural: "investors" },
  companies: { singular: "company", plural: "companies" }
};

const CAROUSEL_TITLES: Record<EntityScope, {suggested: string;trending: string;}> = {
  all: { suggested: "Suggested for You", trending: "Trending Now" },
  founders: { suggested: "Suggested Founders", trending: "Trending Founders" },
  investors: { suggested: "Suggested Investors", trending: "Trending Investors" },
  companies: { suggested: "Suggested Companies", trending: "Trending Companies" }
};

const PAGE_SIZE = 9;

const MAGIC_PROMPTS: Record<EntityScope, string[]> = {
  all: [
  "Match me with Seed investors",
  "Climate tech founders near me",
  "Startups with similar traction",
  "AI agents for enterprise",
  "B2B SaaS at Series A",
  "Deep tech in my region"],

  founders: [
  "Technical co-founders in NYC",
  "Solo founders scaling B2B SaaS",
  "Second-time climate founders",
  "YC alumni in healthcare"],

  investors: [
  "Active Pre-Seed climate funds",
  "Lead investors for Seed SaaS",
  "Angels investing in deep tech",
  "VCs with recent AI exits"],

  companies: [
  "B2B SaaS with $1M+ ARR",
  "Pre-revenue AI startups in SF",
  "Series A construction tech",
  "Climate startups with gov contracts"]

};

const GLOBAL_TABS: {id: EntityScope;label: string;icon: typeof Users;}[] = [
{ id: "all", label: "All", icon: LayoutGrid },
{ id: "founders", label: "Founders", icon: Users },
{ id: "companies", label: "Companies", icon: Building2 },
{ id: "investors", label: "Investors", icon: Briefcase }];


const SCOPE_PLACEHOLDERS: Record<EntityScope, string[]> = {
  all: [
  'Try "Seed stage industrial tech in California..."',
  'Try "B2B SaaS with $1M+ ARR..."',
  'Try "Climate founders in New York..."',
  'Try "AI agents for healthcare..."'],

  founders: [
  'Search founders or try "Technical co-founders in NYC..."',
  'Try "Solo founders with enterprise traction..."'],

  investors: [
  'Search investors or try "Active Pre-Seed climate funds..."',
  'Try "Lead investors for Seed rounds in SaaS..."'],

  companies: [
  'Search companies or try "B2B SaaS with $1M+ ARR..."',
  'Try "Series A construction tech companies..."']

};

// ── Typing placeholder effect ──
function useTypingPlaceholder(phrases: string[], speed = 60, pause = 2200) {
  const [text, setText] = useState("");
  const idx = useRef(0);
  const charIdx = useRef(0);
  const deleting = useRef(false);

  useEffect(() => {
    const tick = () => {
      const phrase = phrases[idx.current];
      if (!deleting.current) {
        charIdx.current++;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current === phrase.length) {
          deleting.current = true;
          return pause;
        }
      } else {
        charIdx.current--;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current === 0) {
          deleting.current = false;
          idx.current = (idx.current + 1) % phrases.length;
        }
      }
      return deleting.current ? speed / 2 : speed;
    };
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const delay = tick();
      timer = setTimeout(run, delay);
    };
    timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
  }, [phrases, speed, pause]);

  return text;
}

// ── Skeleton card ──
function FounderCardSkeleton() {
  return (
    <Card className="surface-card overflow-hidden min-w-[300px] snap-start shrink-0">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>);

}

// ── Founder Card ──
function FounderCard({ founder, trending, onClick }: {founder: DirectoryEntry;trending?: boolean;onClick?: () => void;}) {
  return (
    <Card
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
      trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"}`
      }>
      {/* Color banner */}
      <div className={`h-10 ${trending ? "bg-gradient-to-r from-accent/10 to-primary/5" : "bg-gradient-to-r from-muted to-secondary/30"}`} />
      <CardContent className="p-5 -mt-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border-2 border-background shadow-sm text-sm font-bold text-muted-foreground shrink-0">
            {founder.initial}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end mt-2">
            {trending &&
            <Badge className="text-[9px] font-medium px-2 py-0.5 bg-accent/10 text-accent border-accent/20">
                <Flame className="h-2.5 w-2.5 mr-0.5" /> Trending
              </Badge>
            }
            <Badge variant="outline" className="text-[9px] font-medium px-2 py-0.5">{founder.stage}</Badge>
            <Badge variant="secondary" className="text-[9px] font-normal px-2 py-0.5 max-w-[120px] truncate">{founder.sector}</Badge>
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors">{founder.name}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">{founder.description}</p>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          {founder.location &&
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" /> {founder.location}
            </span>
          }
          {founder.matchReason &&
          <Badge className="text-[9px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {founder.matchReason}
            </Badge>
          }
        </div>
      </CardContent>
    </Card>);

}

// ── Carousel-ready card wrapper ──
function CarouselCard({ founder, trending, onClick }: {founder: DirectoryEntry;trending?: boolean;onClick?: () => void;}) {
  return (
    <div className="min-w-[300px] w-80 shrink-0 snap-start">
      <FounderCard founder={founder} trending={trending} onClick={onClick} />
    </div>);

}


export function CommunityView({ companyData, analysisResult, onNavigateProfile, variant = "directory" }: CommunityViewProps) {
  const isInvestorSearch = variant === "investor-search";
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeInvestorTab, setActiveInvestorTab] = useState<string>("all");
  const [showMagicPrompts, setShowMagicPrompts] = useState(true);
  const [activeScope, setActiveScope] = useState<EntityScope>(isInvestorSearch ? "investors" : "all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<DirectoryEntry | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasProfile = !!companyData?.name;

  const placeholder = useTypingPlaceholder(SCOPE_PLACEHOLDERS[activeScope]);

  // ── Smart Cohort data ──
  const cohorts = useMemo(() => {
    const userLocation = companyData?.hqLocation || "San Francisco, CA";
    const userCity = userLocation.split(",")[0].trim();
    const userStage = companyData?.stage || "Seed";

    const localCount = ALL_ENTRIES.filter((e) => e.location.includes(userCity)).length;
    const stageCount = ALL_ENTRIES.filter((e) => e.stage === userStage).length;
    const founderCount = ALL_ENTRIES.filter((e) => e.category === "founder").length;
    const matchCount = ALL_ENTRIES.filter((e) => e.matchReason).length;

    return [
    { id: "local", value: localCount || 12, label: `In ${userCity}`, icon: MapPin, filterKey: userCity },
    { id: "stage", value: stageCount || 8, label: `${userStage} Stage Peers`, icon: Zap, filterKey: userStage },
    { id: "founders", value: founderCount, label: "Active Founders", icon: Users, filterKey: "" },
    { id: "matches", value: matchCount || 5, label: "New Matches", icon: TrendingUp, filterKey: "" }] as
    const;
  }, [companyData]);

  // Cohort click handler — inject filter into search
  const handleCohortClick = useCallback((filterKey: string, scopeOverride?: EntityScope) => {
    if (filterKey) {
      setSearchQuery(filterKey);
      setShowMagicPrompts(false);
    }
    if (scopeOverride) setActiveScope(scopeOverride);
  }, []);

  useEffect(() => {
    if (searchQuery.length > 0) {
      setIsSearching(true);
      const t = setTimeout(() => setIsSearching(false), 800);
      return () => clearTimeout(t);
    }
    setIsSearching(false);
    if (!searchQuery) setShowMagicPrompts(true);
  }, [searchQuery]);

  // Reset pagination on filter/search/scope change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, activeFilter, activeScope]);

  const scopedAll = filterByScope(ALL_ENTRIES, activeScope);

  const filteredAll = scopedAll.filter((f) => {
    const q = searchQuery.toLowerCase();
    const filterQ = activeFilter?.toLowerCase() || "";
    const matchesSearch = !q || [f.name, f.sector, f.stage, f.description, f.location, f.model].
    some((v) => v?.toLowerCase().includes(q));
    const matchesFilter = !filterQ ||
    f.stage.toLowerCase().includes(filterQ) ||
    f.sector.toLowerCase().includes(filterQ) ||
    f.model.toLowerCase().includes(filterQ);
    return matchesSearch && matchesFilter;
  });

  const hasMore = visibleCount < filteredAll.length;
  const visibleFounders = filteredAll.slice(0, visibleCount);

  const scopedSuggested = filterByScope(SUGGESTED_ENTRIES, activeScope);
  const scopedTrending = filterByScope(TRENDING_ENTRIES, activeScope);
  const labels = SCOPE_LABELS[activeScope];
  const carouselTitles = CAROUSEL_TITLES[activeScope];

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    // Simulate network delay for smooth UX
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredAll.length));
      setIsLoadingMore(false);
    }, 400);
  }, [hasMore, isLoadingMore, filteredAll.length]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const logoUrl = (() => {
    try {return localStorage.getItem("company-logo-url") || null;} catch {return null;}
  })();

  return (
    <div className="space-y-2">
      {/* Top navbar for investor-search */}
      {variant === "investor-search" && (
        <div className="fixed top-0 right-0 z-50 border-b border-border bg-card/80 backdrop-blur-md px-8 py-4 mb-4" style={{ left: "11rem" }}>
          <button
            onClick={onNavigateProfile}
            className="flex items-center gap-4 group cursor-pointer"
          >
            <div className="relative w-12 h-12 rounded-xl border border-emerald-400/40 bg-muted/30 animate-[glow-pulse_2.5s_ease-in-out_infinite] group-hover:shadow-[0_0_18px_4px_rgba(52,211,153,0.35)] transition-all flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-contain rounded-xl" />
              ) : hasProfile ? (
                <span className="text-lg font-bold text-muted-foreground">
                  {companyData!.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="text-left">
              <h1 className="text-xl font-semibold tracking-tight text-foreground group-hover:text-accent transition-colors">
                {hasProfile ? companyData!.name : "My Company"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Investor search &amp; discovery
              </p>
            </div>
          </button>
        </div>
      )}
      {variant === "investor-search" && <div className="h-20" />}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        {variant !== "investor-search" && (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Investor Directory
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Discover and connect with founders building the future</p>
        </div>
        )}

        {variant !== "investor-search" && (
          hasProfile ?
          <button
            onClick={onNavigateProfile}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm hover:shadow-md hover:border-accent/30 transition-all cursor-pointer group shrink-0">
            
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted border border-border overflow-hidden shrink-0">
                {logoUrl ?
              <img src={logoUrl} alt="" className="w-full h-full object-contain" /> :

              <span className="text-xs font-bold text-muted-foreground">
                    {companyData!.name.charAt(0).toUpperCase()}
                  </span>
              }
              </div>
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground font-medium block leading-none mb-0.5">Your Company</span>
                <span className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors leading-none">{companyData!.name}</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-accent transition-colors ml-1" />
            </button> :

          <button
            onClick={onNavigateProfile}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-2.5 hover:border-accent/30 transition-all cursor-pointer group shrink-0">
            
              <Building2 className="h-4 w-4 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Set up your company</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
        )}
      </div>

      {/* ── Smart Cohort Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        {cohorts.map((cohort) => {
          const Icon = cohort.icon;
          return (
            <button
              key={cohort.id}
              onClick={() => handleCohortClick(
                cohort.filterKey,
                cohort.id === "founders" ? "founders" : undefined
              )}
              className="relative overflow-hidden bg-card border border-border rounded-xl p-4 flex flex-col text-left cursor-pointer hover:border-accent/50 hover:shadow-md hover:-translate-y-0.5 transition-all group">
              
              <span className="text-2xl font-bold text-foreground group-hover:text-accent transition-colors">
                {cohort.value}
              </span>
              <span className="text-xs text-muted-foreground font-medium mt-0.5">
                {cohort.label}
              </span>
              <Icon className="absolute -bottom-1.5 -right-1.5 w-10 h-10 text-muted/60 group-hover:text-accent/10 transition-colors" />
            </button>);

        })}
      </div>

      {/* Global Entity Tabs — hidden for investor-search */}
      {!isInvestorSearch && (
      <div className="flex space-x-1 bg-secondary/50 p-1 rounded-lg w-fit">
        {GLOBAL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeScope === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveScope(tab.id);
                setShowMagicPrompts(true);
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              isActive ?
              "bg-card text-foreground shadow-sm" :
              "text-muted-foreground hover:text-foreground"}`
              }>
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>);
        })}
      </div>
      )}

      {/* Investor Search Tabs */}
      {isInvestorSearch && (
      <div className="flex space-x-1 bg-secondary/50 p-1 rounded-lg w-fit">
        {([
          { id: "all", label: "All", icon: LayoutGrid },
          { id: "matches", label: "Matches", icon: Handshake },
          { id: "stage", label: "Stage", icon: Zap },
          { id: "sector", label: "Sector", icon: Layers },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeInvestorTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveInvestorTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              isActive ?
              "bg-card text-foreground shadow-sm" :
              "text-muted-foreground hover:text-foreground"}`
              }>
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>);
        })}
      </div>
      )}

      {/* Search Omnibar */}
      <SearchOmnibar
        value={searchQuery}
        onChange={setSearchQuery}
        scope={activeScope}
        placeholder={placeholder} />
      

      {/* Magic Prompts */}
      {showMagicPrompts && !searchQuery &&
      <div className="flex items-center gap-3 w-full relative">
          <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider whitespace-nowrap shrink-0">Try:</span>
          <div
          className="flex flex-row overflow-x-auto snap-x snap-mandatory scroll-smooth w-full py-2 gap-3 pr-8 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{
            maskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)'
          }}>
          
            {MAGIC_PROMPTS[activeScope].map((prompt) =>
          <button
            key={prompt}
            onClick={() => {
              setSearchQuery(prompt);
              setShowMagicPrompts(false);
            }}
            className="snap-start whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-accent/10 to-primary/10 text-accent border border-accent/20 hover:border-accent/40 hover:shadow-sm cursor-pointer transition-all shrink-0">
            
                <Sparkles className="w-3.5 h-3.5 text-accent/70" />
                {prompt}
              </button>
          )}
          </div>
        </div>
      }

      {/* ═══════ Search Results First (when searching) ═══════ */}
      {searchQuery &&
      <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Search Results</h2>
            <span className="text-[10px] text-muted-foreground font-mono">
              {isSearching ? "Matching..." : `${visibleFounders.length} of ${filteredAll.length} ${labels.plural}`}
            </span>
          </div>

          {isSearching ?
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) =>
          <FounderCardSkeleton key={i} />
          )}
            </div> :
        visibleFounders.length > 0 ?
        <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleFounders.map((founder, i) =>
            <FounderCard key={`search-${i}`} founder={founder} onClick={() => setSelectedFounder(founder)} />
            )}
                {isLoadingMore &&
            Array.from({ length: 3 }).map((_, i) =>
            <FounderCardSkeleton key={`loading-${i}`} />
            )}
              </div>
              <div ref={sentinelRef} className="h-1" />
              {hasMore && !isLoadingMore &&
          <div className="flex justify-center pt-2">
                  <button onClick={loadMore} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 shadow-sm hover:shadow-md transition-all">
                    Load more founders
                  </button>
                </div>
          }
              {isLoadingMore &&
          <div className="flex justify-center pt-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
          }
            </> :

        <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No {labels.plural} match your search.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try a broader query or remove filters.</p>
            </div>
        }
        </div>
      }

      {/* ═══════ Carousel: Suggested ═══════ */}
      {scopedSuggested.length > 0 &&
      <div className="pt-4">
          <FounderCarousel title={carouselTitles.suggested} subtitle="Curated matches based on your profile">
            {scopedSuggested.map((entry, i) =>
          <CarouselCard key={`suggested-${i}`} founder={entry} onClick={() => setSelectedFounder(entry)} />
          )}
          </FounderCarousel>
        </div>
      }

      {/* ═══════ Carousel: Trending ═══════ */}
      {scopedTrending.length > 0 &&
      <div className="pt-4">
          <FounderCarousel title={carouselTitles.trending} subtitle="Most active this week">
            {scopedTrending.map((entry, i) =>
          <CarouselCard key={`trending-${i}`} founder={entry} trending onClick={() => setSelectedFounder(entry)} />
          )}
          </FounderCarousel>
        </div>
      }

      {/* ═══════ All Founders Grid (only when NOT searching) ═══════ */}
      {!searchQuery &&
      <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">All {labels.plural.charAt(0).toUpperCase() + labels.plural.slice(1)}</h2>
            <span className="text-[10px] text-muted-foreground font-mono">
              {isSearching ? "Matching..." : `${visibleFounders.length} of ${filteredAll.length} ${labels.plural}`}
            </span>
          </div>

          {isSearching ?
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) =>
          <FounderCardSkeleton key={i} />
          )}
            </div> :
        visibleFounders.length > 0 ?
        <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleFounders.map((founder, i) =>
            <FounderCard key={`all-${i}`} founder={founder} onClick={() => setSelectedFounder(founder)} />
            )}
                {isLoadingMore &&
            Array.from({ length: 3 }).map((_, i) =>
            <FounderCardSkeleton key={`loading-${i}`} />
            )}
              </div>
              <div ref={sentinelRef} className="h-1" />
              {hasMore && !isLoadingMore &&
          <div className="flex justify-center pt-2">
                  <button onClick={loadMore} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 shadow-sm hover:shadow-md transition-all">
                    Load more founders
                  </button>
                </div>
          }
              {isLoadingMore &&
          <div className="flex justify-center pt-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
          }
            </> :

        <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No {labels.plural} match your search.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try a broader query or remove filters.</p>
            </div>
        }
        </div>
      }

      {/* Slide-over Detail Panel */}
      <FounderDetailPanel
        founder={selectedFounder}
        companyName={companyData?.name}
        onClose={() => setSelectedFounder(null)} />
      
    </div>);

}