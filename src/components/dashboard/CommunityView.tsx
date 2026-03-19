import { useState, useEffect, useRef } from "react";
import {
  Search, Users, Building2, MapPin, Globe, Sparkles, Eye, EyeOff, Pencil,
  TrendingUp, Star, ArrowRight, LayoutGrid,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";
import { SECTOR_OPTIONS, STAGE_OPTIONS, BUSINESS_MODEL_OPTIONS } from "@/constants/taxonomy";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
}

// ── Mock directory entries ──
const MOCK_FOUNDERS = [
  { name: "Constructiv AI", sector: "Construction & Real Estate", stage: "Seed", description: "AI-powered project management for mid-size contractors. Automates scheduling, risk forecasting, and compliance tracking.", location: "San Francisco, CA", model: "B2B SaaS", initial: "C", matchReason: null },
  { name: "GridShift Energy", sector: "Climate & Energy", stage: "Series A", description: "Smart grid optimization platform using reinforcement learning to reduce energy waste by 40% for commercial buildings.", location: "Austin, TX", model: "Usage-Based", initial: "G", matchReason: "Matches your stage" },
  { name: "VaultMed", sector: "Health & Biotech", stage: "Pre-Seed", description: "Decentralized health records platform giving patients full ownership of their medical data via zero-knowledge proofs.", location: "Boston, MA", model: "B2B SaaS", initial: "V", matchReason: null },
  { name: "Mosaic Retail", sector: "Consumer & Retail", stage: "Series B", description: "AI visual merchandising engine for e-commerce brands. Increases conversion by dynamically optimizing product layouts.", location: "New York, NY", model: "Marketplace", initial: "M", matchReason: "Matches your sector" },
  { name: "DefenseKit", sector: "Defense & GovTech", stage: "Seed", description: "Dual-use drone swarm coordination software for search-and-rescue and perimeter defense operations.", location: "Arlington, VA", model: "Licensing", initial: "D", matchReason: null },
  { name: "QuantumForge", sector: "Deep Tech & Space", stage: "Series A", description: "Quantum computing compiler toolchain that reduces qubit error rates by 60%. Making quantum practical for pharma R&D.", location: "Boulder, CO", model: "B2B SaaS", initial: "Q", matchReason: null },
];

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
    const schedule = () => { timer = setTimeout(() => { const next = tick(); schedule(); }, tick()); };
    // simpler approach
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
    <Card className="surface-card overflow-hidden">
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
function FounderCard({ founder }: { founder: typeof MOCK_FOUNDERS[0] }) {
  return (
    <Card className="surface-card overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer border-border/60 hover:border-accent/30">
      <CardContent className="p-5 space-y-3">
        {/* Top: Logo + Badges */}
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted border border-border text-sm font-bold text-muted-foreground shrink-0">
            {founder.initial}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <Badge variant="outline" className="text-[9px] font-medium px-2 py-0.5">{founder.stage}</Badge>
            <Badge variant="secondary" className="text-[9px] font-normal px-2 py-0.5 max-w-[120px] truncate">{founder.sector}</Badge>
          </div>
        </div>

        {/* Middle: Name + Description */}
        <div>
          <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors">{founder.name}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">{founder.description}</p>
        </div>

        {/* Bottom: Location + Match */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          {founder.location && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" /> {founder.location}
            </span>
          )}
          {founder.matchReason && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent font-medium">
              <Sparkles className="h-2.5 w-2.5" /> {founder.matchReason}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const DIRECTORY_TABS = [
  { id: "companies" as const, label: "Companies", icon: Building2 },
  { id: "members" as const, label: "Members", icon: Users },
  { id: "investors" as const, label: "Investors", icon: TrendingUp },
  { id: "locations" as const, label: "Locations", icon: MapPin },
] as const;

type DirectoryTab = typeof DIRECTORY_TABS[number]["id"];

export function CommunityView({ companyData, analysisResult }: CommunityViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<DirectoryTab>("companies");

  const hasProfile = !!companyData?.name;

  const placeholder = useTypingPlaceholder([
    'Try "Seed stage industrial tech in California..."',
    'Try "B2B SaaS with $1M+ ARR..."',
    'Try "Climate founders in New York..."',
    'Try "AI agents for healthcare..."',
  ]);

  // Simulate vector search loading
  useEffect(() => {
    if (searchQuery.length > 0) {
      setIsSearching(true);
      const t = setTimeout(() => setIsSearching(false), 800);
      return () => clearTimeout(t);
    }
    setIsSearching(false);
  }, [searchQuery]);

  // Simple client-side filter on mock data
  const filteredFounders = MOCK_FOUNDERS.filter((f) => {
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

  const logoUrl = (() => {
    try { return localStorage.getItem("company-logo-url") || null; } catch { return null; }
  })();

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Founder Directory</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Discover and connect with founders building the future</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ═══════ Main Content (3 cols) ═══════ */}
        <div className="lg:col-span-3 space-y-5">
          {/* Smart Search Hero */}
          <div className="space-y-3">
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
          </div>

          {/* Section Title */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {searchQuery ? "Search Results" : "Suggested Founders"}
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono">
              {isSearching ? "Matching..." : `${filteredFounders.length} founders`}
            </span>
          </div>

          {/* Results Grid */}
          {isSearching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <FounderCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredFounders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredFounders.map((founder, i) => (
                <FounderCard key={i} founder={founder} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No founders match your search.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try a broader query or remove filters.</p>
            </div>
          )}
        </div>

        {/* ═══════ Right Sidebar ═══════ */}
        <div className="lg:col-span-1">
          <Card className="surface-card sticky top-6">
            {/* Visibility Toggle */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-xs font-semibold text-foreground">Your Listing</span>
              <div className="flex items-center gap-2">
                {isVisible ? (
                  <Eye className="h-3 w-3 text-success" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-[10px] text-muted-foreground font-medium">
                  {isVisible ? "Live" : "Hidden"}
                </span>
                <Switch checked={isVisible} onCheckedChange={setIsVisible} className="scale-75 origin-right" />
              </div>
            </div>

            <CardContent className="px-5 pb-5 pt-0">
              {hasProfile ? (
                <div className="space-y-4">
                  {/* Preview Card */}
                  <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                    {/* Logo + Name */}
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-lg font-bold text-muted-foreground">
                            {companyData!.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{companyData!.name}</h3>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          {companyData!.stage && (
                            <Badge variant="outline" className="text-[9px] font-medium">{companyData!.stage}</Badge>
                          )}
                          {companyData!.sector && (
                            <Badge variant="secondary" className="text-[9px] font-normal">{companyData!.sector}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Health Score */}
                    {analysisResult?.healthScore != null && (
                      <div className="flex justify-center">
                        <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                          analysisResult.healthScore >= 80 ? "bg-success/10 text-success" :
                          analysisResult.healthScore >= 60 ? "bg-accent/10 text-accent" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          Score: {analysisResult.healthScore}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {(companyData!.description || companyData!.uniqueValueProp) && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed text-center line-clamp-3">
                        {companyData!.description || companyData!.uniqueValueProp}
                      </p>
                    )}

                    {/* Meta Chips */}
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {companyData!.hqLocation && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary rounded-md px-2 py-1">
                          <MapPin className="h-2.5 w-2.5" /> {companyData!.hqLocation}
                        </span>
                      )}
                      {companyData!.businessModel && (
                        <span className="text-[10px] text-muted-foreground bg-secondary rounded-md px-2 py-1">
                          {companyData!.businessModel}
                        </span>
                      )}
                      {(companyData!.totalHeadcount || companyData!.teamSize) && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary rounded-md px-2 py-1">
                          <Users className="h-2.5 w-2.5" /> {companyData!.totalHeadcount || companyData!.teamSize}
                        </span>
                      )}
                      {companyData!.currentARR && (
                        <span className="text-[10px] text-muted-foreground bg-secondary rounded-md px-2 py-1">
                          ARR: {companyData!.currentARR}
                        </span>
                      )}
                      {companyData!.website && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent/5 rounded-md px-2 py-1">
                          <Globe className="h-2.5 w-2.5" /> Website
                        </span>
                      )}
                    </div>

                    {/* Subsectors */}
                    {companyData!.subsectors && companyData!.subsectors.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1">
                        {companyData!.subsectors.map((sub, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px] font-normal">{sub}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit Profile Button */}
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                    <Pencil className="h-3 w-3" />
                    Edit Profile
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                  <Building2 className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">No listing yet</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Complete your company profile to appear in the directory.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
