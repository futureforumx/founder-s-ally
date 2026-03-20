import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Users, Building2, MapPin, Sparkles,
  TrendingUp, ArrowRight, LayoutGrid, Flame, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";
import { FounderCarousel } from "./FounderCarousel";
import { FounderDetailPanel } from "./FounderDetailPanel";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
  onNavigateProfile?: () => void;
}

// ── Types ──
interface FounderEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  initial: string;
  matchReason: string | null;
}

// ── Mock data: Suggested ──
const SUGGESTED_FOUNDERS: FounderEntry[] = [
  { name: "Constructiv AI", sector: "Construction & Real Estate", stage: "Seed", description: "AI-powered project management for mid-size contractors. Automates scheduling, risk forecasting, and compliance tracking.", location: "San Francisco, CA", model: "B2B SaaS", initial: "C", matchReason: null },
  { name: "GridShift Energy", sector: "Climate & Energy", stage: "Series A", description: "Smart grid optimization platform using reinforcement learning to reduce energy waste by 40% for commercial buildings.", location: "Austin, TX", model: "Usage-Based", initial: "G", matchReason: "Matches your stage" },
  { name: "VaultMed", sector: "Health & Biotech", stage: "Pre-Seed", description: "Decentralized health records platform giving patients full ownership of their medical data via zero-knowledge proofs.", location: "Boston, MA", model: "B2B SaaS", initial: "V", matchReason: null },
  { name: "Mosaic Retail", sector: "Consumer & Retail", stage: "Series B", description: "AI visual merchandising engine for e-commerce brands. Increases conversion by dynamically optimizing product layouts.", location: "New York, NY", model: "Marketplace", initial: "M", matchReason: "Matches your sector" },
  { name: "DefenseKit", sector: "Defense & GovTech", stage: "Seed", description: "Dual-use drone swarm coordination software for search-and-rescue and perimeter defense operations.", location: "Arlington, VA", model: "Licensing", initial: "D", matchReason: null },
  { name: "QuantumForge", sector: "Deep Tech & Space", stage: "Series A", description: "Quantum computing compiler toolchain that reduces qubit error rates by 60%. Making quantum practical for pharma R&D.", location: "Boulder, CO", model: "B2B SaaS", initial: "Q", matchReason: null },
];

// ── Mock data: Trending ──
const TRENDING_FOUNDERS: FounderEntry[] = [
  { name: "NovaBuild", sector: "PropTech", stage: "Series A", description: "Modular construction OS that cuts project timelines by 35% through prefab coordination and real-time site analytics.", location: "Denver, CO", model: "B2B SaaS", initial: "N", matchReason: null },
  { name: "ClearPath Logistics", sector: "Supply Chain", stage: "Seed", description: "End-to-end freight visibility platform. Uses IoT + ML to predict delays 72 hours in advance for last-mile carriers.", location: "Chicago, IL", model: "Usage-Based", initial: "C", matchReason: null },
  { name: "Synthara Bio", sector: "Health & Biotech", stage: "Series B", description: "Synthetic biology platform engineering microbes for sustainable textile dyes, replacing petroleum-based chemicals.", location: "Cambridge, MA", model: "Licensing", initial: "S", matchReason: null },
  { name: "Canopy Finance", sector: "Fintech", stage: "Seed", description: "Embedded lending infrastructure for vertical SaaS platforms. Enables any software company to offer credit products.", location: "Miami, FL", model: "B2B SaaS", initial: "C", matchReason: null },
  { name: "AeroMind", sector: "Deep Tech & Space", stage: "Pre-Seed", description: "Autonomous satellite constellation management using multi-agent AI for collision avoidance and orbit optimization.", location: "Los Angeles, CA", model: "B2B SaaS", initial: "A", matchReason: null },
  { name: "Pepper Robotics", sector: "Industrial Automation", stage: "Series A", description: "Cobotic systems for food processing plants. 3x throughput increase with zero added safety incidents.", location: "Pittsburgh, PA", model: "Hardware + SaaS", initial: "P", matchReason: null },
];

// ── Extended founders for grid ──
const EXTRA_FOUNDERS: FounderEntry[] = [
  { name: "Lumen Health", sector: "Health & Biotech", stage: "Seed", description: "Remote patient monitoring platform using wearable biosensors and predictive AI for chronic disease management.", location: "Nashville, TN", model: "B2B SaaS", initial: "L", matchReason: null },
  { name: "TerraFlow", sector: "Climate & Energy", stage: "Series A", description: "Carbon capture marketplace connecting industrial emitters with verified offset projects using blockchain verification.", location: "Portland, OR", model: "Marketplace", initial: "T", matchReason: "Matches your stage" },
  { name: "CodeVault", sector: "Developer Tools", stage: "Pre-Seed", description: "AI-powered code review platform that detects security vulnerabilities and suggests fixes in real-time during PR reviews.", location: "Seattle, WA", model: "B2B SaaS", initial: "C", matchReason: null },
  { name: "FreshRoute", sector: "Supply Chain", stage: "Seed", description: "Cold chain logistics optimizer for perishable goods. Reduces food waste by 25% through dynamic routing and IoT monitoring.", location: "Atlanta, GA", model: "Usage-Based", initial: "F", matchReason: null },
  { name: "Nucleus AI", sector: "Enterprise AI", stage: "Series B", description: "Enterprise knowledge graph platform that unifies siloed data across departments for AI-ready organizational intelligence.", location: "San Jose, CA", model: "B2B SaaS", initial: "N", matchReason: null },
  { name: "BridgeEd", sector: "EdTech", stage: "Seed", description: "Adaptive learning platform for workforce upskilling. Uses competency mapping to create personalized learning paths.", location: "Washington, DC", model: "B2B SaaS", initial: "B", matchReason: "Matches your sector" },
  { name: "AquaPure Tech", sector: "Climate & Energy", stage: "Series A", description: "Decentralized water purification systems powered by solar energy for off-grid communities and disaster relief.", location: "Phoenix, AZ", model: "Hardware + SaaS", initial: "A", matchReason: null },
  { name: "FleetMind", sector: "Mobility & Logistics", stage: "Pre-Seed", description: "Autonomous fleet management for last-mile delivery using computer vision and edge computing on existing vehicles.", location: "Detroit, MI", model: "Usage-Based", initial: "F", matchReason: null },
  { name: "Vega Legal", sector: "LegalTech", stage: "Seed", description: "AI contract analysis tool that identifies risk clauses and suggests negotiation strategies for in-house legal teams.", location: "Philadelphia, PA", model: "B2B SaaS", initial: "V", matchReason: null },
  { name: "Orion Cyber", sector: "Cybersecurity", stage: "Series A", description: "Zero-trust network access platform with continuous authentication using behavioral biometrics and device posture analysis.", location: "Reston, VA", model: "B2B SaaS", initial: "O", matchReason: null },
  { name: "Bloom Finance", sector: "Fintech", stage: "Pre-Seed", description: "Micro-investment platform for Gen Z that rounds up purchases and invests in curated ESG-focused portfolios.", location: "Brooklyn, NY", model: "Consumer", initial: "B", matchReason: null },
  { name: "DataForge", sector: "Enterprise AI", stage: "Seed", description: "Synthetic data generation platform for ML training. Creates privacy-compliant datasets that mirror production data distributions.", location: "Toronto, ON", model: "Usage-Based", initial: "D", matchReason: null },
];

// ── All founders (combined) ──
const ALL_FOUNDERS: FounderEntry[] = [...SUGGESTED_FOUNDERS, ...TRENDING_FOUNDERS, ...EXTRA_FOUNDERS];

const PAGE_SIZE = 9;

const QUICK_FILTERS = [
  "Series A", "B2B SaaS", "Recently Updated", "Matching My Sector", "Pre-Seed", "AI / ML", "Climate",
];

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
    </Card>
  );
}

// ── Founder Card ──
function FounderCard({ founder, trending, onClick }: { founder: FounderEntry; trending?: boolean; onClick?: () => void }) {
  return (
    <Card
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
      trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"
    }`}>
      {/* Color banner */}
      <div className={`h-10 ${trending ? "bg-gradient-to-r from-accent/10 to-primary/5" : "bg-gradient-to-r from-muted to-secondary/30"}`} />
      <CardContent className="p-5 -mt-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border-2 border-background shadow-sm text-sm font-bold text-muted-foreground shrink-0">
            {founder.initial}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end mt-2">
            {trending && (
              <Badge className="text-[9px] font-medium px-2 py-0.5 bg-accent/10 text-accent border-accent/20">
                <Flame className="h-2.5 w-2.5 mr-0.5" /> Trending
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] font-medium px-2 py-0.5">{founder.stage}</Badge>
            <Badge variant="secondary" className="text-[9px] font-normal px-2 py-0.5 max-w-[120px] truncate">{founder.sector}</Badge>
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors">{founder.name}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">{founder.description}</p>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          {founder.location && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" /> {founder.location}
            </span>
          )}
          {founder.matchReason && (
            <Badge className="text-[9px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {founder.matchReason}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Carousel-ready card wrapper ──
function CarouselCard({ founder, trending }: { founder: FounderEntry; trending?: boolean }) {
  return (
    <div className="min-w-[300px] w-80 shrink-0 snap-start">
      <FounderCard founder={founder} trending={trending} />
    </div>
  );
}

const DIRECTORY_TABS = [
  { id: "companies" as const, label: "Companies", icon: Building2 },
  { id: "members" as const, label: "Members", icon: Users },
  { id: "investors" as const, label: "Investors", icon: TrendingUp },
  { id: "locations" as const, label: "Locations", icon: MapPin },
  { id: "all" as const, label: "All", icon: LayoutGrid },
] as const;

type DirectoryTab = typeof DIRECTORY_TABS[number]["id"];

export function CommunityView({ companyData, analysisResult, onNavigateProfile }: CommunityViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DirectoryTab>("companies");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasProfile = !!companyData?.name;

  const placeholder = useTypingPlaceholder([
    'Try "Seed stage industrial tech in California..."',
    'Try "B2B SaaS with $1M+ ARR..."',
    'Try "Climate founders in New York..."',
    'Try "AI agents for healthcare..."',
  ]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      setIsSearching(true);
      const t = setTimeout(() => setIsSearching(false), 800);
      return () => clearTimeout(t);
    }
    setIsSearching(false);
  }, [searchQuery]);

  // Reset pagination on filter/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, activeFilter]);

  const filteredAll = ALL_FOUNDERS.filter((f) => {
    const q = searchQuery.toLowerCase();
    const filterQ = activeFilter?.toLowerCase() || "";
    const matchesSearch = !q || [f.name, f.sector, f.stage, f.description, f.location, f.model]
      .some((v) => v?.toLowerCase().includes(q));
    const matchesFilter = !filterQ ||
      f.stage.toLowerCase().includes(filterQ) ||
      f.sector.toLowerCase().includes(filterQ) ||
      f.model.toLowerCase().includes(filterQ);
    return matchesSearch && matchesFilter;
  });

  const hasMore = visibleCount < filteredAll.length;
  const visibleFounders = filteredAll.slice(0, visibleCount);

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
    try { return localStorage.getItem("company-logo-url") || null; } catch { return null; }
  })();

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Founder Directory</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Discover and connect with founders building the future</p>
        </div>

        {hasProfile ? (
          <button
            onClick={onNavigateProfile}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm hover:shadow-md hover:border-accent/30 transition-all cursor-pointer group shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted border border-border overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">
                  {companyData!.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-left">
              <span className="text-[10px] text-muted-foreground font-medium block leading-none mb-0.5">Your Company</span>
              <span className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors leading-none">{companyData!.name}</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-accent transition-colors ml-1" />
          </button>
        ) : (
          <button
            onClick={onNavigateProfile}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-2.5 hover:border-accent/30 transition-all cursor-pointer group shrink-0"
          >
            <Building2 className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Set up your company</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-accent transition-colors" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="flex h-14 w-full rounded-2xl border border-border bg-card pl-12 pr-4 text-base shadow-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow"
        />
      </div>

      {/* Directory Tab Toggle */}
      <div className="flex items-center gap-1 rounded-xl bg-secondary/60 p-1 w-fit">
        {DIRECTORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Quick Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {QUICK_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(activeFilter === filter ? null : filter)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === filter
                ? "bg-accent text-accent-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-muted"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* ═══════ Carousel: Suggested Founders ═══════ */}
      <div className="pt-4">
        <FounderCarousel title="Suggested Founders" subtitle="Curated matches based on your profile">
          {SUGGESTED_FOUNDERS.map((founder, i) => (
            <CarouselCard key={`suggested-${i}`} founder={founder} />
          ))}
        </FounderCarousel>
      </div>

      {/* ═══════ Carousel: Trending Profiles ═══════ */}
      <div className="pt-8">
        <FounderCarousel title="Trending Profiles" subtitle="Most active this week">
          {TRENDING_FOUNDERS.map((founder, i) => (
            <CarouselCard key={`trending-${i}`} founder={founder} trending />
          ))}
        </FounderCarousel>
      </div>

      {/* ═══════ All Founders Grid ═══════ */}
      <div className="space-y-3 pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">All Founders</h2>
          <span className="text-[10px] text-muted-foreground font-mono">
            {isSearching ? "Matching..." : `${visibleFounders.length} of ${filteredAll.length} founders`}
          </span>
        </div>

        {isSearching ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <FounderCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleFounders.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleFounders.map((founder, i) => (
                <FounderCard key={`all-${i}`} founder={founder} />
              ))}
              {isLoadingMore &&
                Array.from({ length: 3 }).map((_, i) => (
                  <FounderCardSkeleton key={`loading-${i}`} />
                ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {hasMore && !isLoadingMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={loadMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 shadow-sm hover:shadow-md transition-all"
                >
                  Load more founders
                </button>
              </div>
            )}

            {isLoadingMore && (
              <div className="flex justify-center pt-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No founders match your search.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try a broader query or remove filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
