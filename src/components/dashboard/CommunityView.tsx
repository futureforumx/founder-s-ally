import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Users, Building2, MapPin, Sparkles, Briefcase, Handshake, Layers,
  ArrowRight, Flame, Loader2, LayoutGrid, Zap, TrendingUp, UserCog, CheckCircle2,
  DollarSign, Activity, Heart, Info } from
"lucide-react";
import { VCBadgeContainer } from "@/components/investor-match/VCBadgeContainer";
import { FirmLogo } from "@/components/ui/firm-logo";
import { useInvestorDirectory } from "@/hooks/useInvestorDirectory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";
import { useVCDirectory, type VCFirm, type VCPerson } from "@/hooks/useVCDirectory";
import { useFounderProfiles, type FounderProfile } from "@/hooks/useProfile";
import { FounderCarousel } from "./FounderCarousel";
import { FounderDetailPanel } from "./FounderDetailPanel";
import { InvestorDetailPanel } from "./InvestorDetailPanel";
import { PersonProfileModal } from "./PersonProfileModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
  onNavigateProfile?: () => void;
  variant?: "directory" | "investor-search";
}

// ── Types ──
type EntryCategory = "founder" | "investor" | "company" | "operator";

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
  /** Original sector strings from VC JSON for exact matching */
  _sectors?: string[];
  /** Original stage strings from VC JSON for exact matching */
  _stages?: string[];
  /** Whether this is a real DB-backed profile */
  _isRealProfile?: boolean;
  /** Linked company name for founder profiles */
  _companyName?: string | null;
  /** Profile ID for navigation */
  _profileId?: string;
  /** Investor-specific enrichment fields */
  _firmType?: string;
  _isActivelyDeploying?: boolean;
  _founderSentimentScore?: number | null;
  _headcount?: string | null;
  _aum?: string | null;
  _logoUrl?: string | null;
  _matchScore?: number | null;
  _firmId?: string | null;
  _websiteUrl?: string | null;
  _isTrending?: boolean;
  _isPopular?: boolean;
  _isRecent?: boolean;
}

// ── Mock data: Suggested ──
const SUGGESTED_ENTRIES: DirectoryEntry[] = [
// Founders (people)
{ name: "Sarah Kim", sector: "Construction & Real Estate", stage: "Seed", description: "Technical co-founder building AI-powered project management tools for mid-size contractors. Ex-Google engineer.", location: "San Francisco, CA", model: "CEO & Co-founder", initial: "S", matchReason: null, category: "founder" },
{ name: "James Okoro", sector: "Climate & Energy", stage: "Series A", description: "Serial entrepreneur focused on smart grid optimization. Previously scaled an energy analytics startup to $8M ARR.", location: "Austin, TX", model: "Founder & CEO", initial: "J", matchReason: "Matches your stage", category: "founder" },
{ name: "Priya Patel", sector: "Health & Biotech", stage: "Pre-Seed", description: "Biomedical engineer turned founder. Building decentralized health records with zero-knowledge proofs.", location: "Boston, MA", model: "Co-founder & CTO", initial: "P", matchReason: null, category: "founder" },
{ name: "Alex Rivera", sector: "Consumer & Retail", stage: "Series B", description: "Second-time founder with a $45M exit in e-commerce. Now building AI visual merchandising for brands.", location: "New York, NY", model: "Founder & CEO", initial: "A", matchReason: "Matches your sector", category: "founder" },
// Investors
{ name: "Sequoia Capital", sector: "Multi-stage", stage: "Seed–Growth", description: "Premier venture capital firm backing transformative companies from seed to IPO across technology sectors.", location: "Menlo Park, CA", model: "$1M–$50M", initial: "S", matchReason: "Matches your sector", category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 88, _headcount: "250+", _aum: "$85B" },
{ name: "Lux Capital", sector: "Deep Tech", stage: "Seed–Series B", description: "Invests in emerging science and technology ventures at the outermost edges of what's possible.", location: "New York, NY", model: "$1M–$25M", initial: "L", matchReason: null, category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 76, _headcount: "45", _aum: "$4B" },
{ name: "First Round Capital", sector: "Software & Consumer", stage: "Pre-Seed–Seed", description: "Seed-stage venture firm partnering with founders who are reimagining work, commerce, and daily life.", location: "San Francisco, CA", model: "$500K–$3M", initial: "F", matchReason: "Active in your stage", category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 92, _headcount: "55", _aum: "$1.5B" },
// Companies
{ name: "NovaBuild", sector: "PropTech", stage: "Series A", description: "Modular construction OS that cuts project timelines by 35% through prefab coordination and real-time site analytics.", location: "Denver, CO", model: "B2B SaaS", initial: "N", matchReason: null, category: "company" },
{ name: "Canopy Finance", sector: "Fintech", stage: "Seed", description: "Embedded lending infrastructure for vertical SaaS platforms. Enables any software company to offer credit products.", location: "Miami, FL", model: "B2B SaaS", initial: "C", matchReason: null, category: "company" },
{ name: "Synthara Bio", sector: "Health & Biotech", stage: "Series B", description: "Synthetic biology platform engineering microbes for sustainable textile dyes, replacing petroleum-based chemicals.", location: "Cambridge, MA", model: "Licensing", initial: "S", matchReason: null, category: "company" },
// Operators
{ name: "Rachel Torres", sector: "B2B SaaS", stage: "Seed–Series A", description: "Fractional VP Engineering with 12 years scaling dev teams from 5 to 50. Previously CTO at a $200M exit in logistics tech.", location: "San Francisco, CA", model: "Fractional", initial: "R", matchReason: "Matches your stage", category: "operator" },
{ name: "Marcus Chen", sector: "Fintech", stage: "Series A–B", description: "Operating partner and fractional CFO specializing in SaaS metrics, fundraising strategy, and financial modeling for growth-stage startups.", location: "New York, NY", model: "Advisory", initial: "M", matchReason: null, category: "operator" }];


// ── Mock data: Trending ──
const TRENDING_ENTRIES: DirectoryEntry[] = [
// Founders (people)
{ name: "Wei Zhang", sector: "Defense & GovTech", stage: "Seed", description: "Former DARPA researcher building dual-use drone swarm coordination software for search-and-rescue operations.", location: "Arlington, VA", model: "Founder & CEO", initial: "W", matchReason: null, category: "founder" },
{ name: "Leila Farouk", sector: "Deep Tech & Space", stage: "Series A", description: "Quantum physicist turned founder. Building compiler toolchains that reduce qubit error rates by 60%.", location: "Boulder, CO", model: "Co-founder & CTO", initial: "L", matchReason: null, category: "founder" },
{ name: "Ryan Nakamura", sector: "Deep Tech & Space", stage: "Pre-Seed", description: "Ex-SpaceX engineer building autonomous satellite constellation management using multi-agent AI systems.", location: "Los Angeles, CA", model: "Founder & CEO", initial: "R", matchReason: null, category: "founder" },
// Investors
{ name: "a16z", sector: "Software & Crypto", stage: "Seed–Growth", description: "Andreessen Horowitz is a venture capital firm that backs bold entrepreneurs building the future.", location: "Menlo Park, CA", model: "$500K–$100M", initial: "A", matchReason: null, category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 71, _headcount: "500+", _aum: "$42B" },
{ name: "Founders Fund", sector: "Frontier Tech", stage: "Seed–Growth", description: "Peter Thiel's fund investing in revolutionary companies that push the frontier of technology.", location: "San Francisco, CA", model: "$500K–$50M", initial: "F", matchReason: null, category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 65, _headcount: "50", _aum: "$11B" },
// Companies
{ name: "ClearPath Logistics", sector: "Supply Chain", stage: "Seed", description: "End-to-end freight visibility platform. Uses IoT + ML to predict delays 72 hours in advance for last-mile carriers.", location: "Chicago, IL", model: "Usage-Based", initial: "C", matchReason: null, category: "company" },
{ name: "Pepper Robotics", sector: "Industrial Automation", stage: "Series A", description: "Cobotic systems for food processing plants. 3x throughput increase with zero added safety incidents.", location: "Pittsburgh, PA", model: "Hardware + SaaS", initial: "P", matchReason: null, category: "company" },
// Operators
{ name: "Diana Okafor", sector: "Growth & Marketing", stage: "Pre-Seed–Seed", description: "Growth operator who scaled three startups from $0 to $5M ARR. Specializes in PLG motions and community-led growth.", location: "Austin, TX", model: "Fractional", initial: "D", matchReason: null, category: "operator" }];


// ── Extended entries for grid ──
const EXTRA_ENTRIES: DirectoryEntry[] = [
{ name: "Elena Vasquez", sector: "Health & Biotech", stage: "Seed", description: "Former Mayo Clinic researcher building remote patient monitoring with wearable biosensors and predictive AI.", location: "Nashville, TN", model: "Founder & CEO", initial: "E", matchReason: null, category: "founder" },
{ name: "TerraFlow", sector: "Climate & Energy", stage: "Series A", description: "Carbon capture marketplace connecting industrial emitters with verified offset projects using blockchain verification.", location: "Portland, OR", model: "Marketplace", initial: "T", matchReason: "Matches your stage", category: "company" },
{ name: "CodeVault", sector: "Developer Tools", stage: "Pre-Seed", description: "AI-powered code review platform that detects security vulnerabilities and suggests fixes in real-time during PR reviews.", location: "Seattle, WA", model: "B2B SaaS", initial: "C", matchReason: null, category: "company" },
{ name: "FreshRoute", sector: "Supply Chain", stage: "Seed", description: "Cold chain logistics optimizer for perishable goods. Reduces food waste by 25% through dynamic routing and IoT monitoring.", location: "Atlanta, GA", model: "Usage-Based", initial: "F", matchReason: null, category: "company" },
{ name: "Omar Hassan", sector: "Enterprise AI", stage: "Series B", description: "Third-time founder building enterprise knowledge graph platforms. Previous exit to Salesforce for $120M.", location: "San Jose, CA", model: "Founder & CEO", initial: "O", matchReason: null, category: "founder" },
{ name: "Maria Santos", sector: "EdTech", stage: "Seed", description: "Former teacher turned founder. Building adaptive learning platforms for workforce upskilling with competency mapping.", location: "Washington, DC", model: "Co-founder & CEO", initial: "M", matchReason: "Matches your sector", category: "founder" },
{ name: "Kleiner Perkins", sector: "Software & Health", stage: "Seed–Growth", description: "Legendary venture firm investing in technology and life science companies driving positive impact.", location: "Menlo Park, CA", model: "$1M–$20M", initial: "K", matchReason: null, category: "investor", _firmType: "Institutional", _isActivelyDeploying: true, _founderSentimentScore: 82, _headcount: "80", _aum: "$18B" },
{ name: "Bessemer Venture Partners", sector: "Cloud & SaaS", stage: "Seed–Growth", description: "One of the oldest VC firms, pioneering cloud computing investments with a century of experience.", location: "San Francisco, CA", model: "$1M–$30M", initial: "B", matchReason: "Active in your sector", category: "investor", _firmType: "Institutional", _isActivelyDeploying: false, _founderSentimentScore: 79, _headcount: "100", _aum: "$22B" },
{ name: "AquaPure Tech", sector: "Climate & Energy", stage: "Series A", description: "Decentralized water purification systems powered by solar energy for off-grid communities and disaster relief.", location: "Phoenix, AZ", model: "Hardware + SaaS", initial: "A", matchReason: null, category: "company" },
{ name: "FleetMind", sector: "Mobility & Logistics", stage: "Pre-Seed", description: "Autonomous fleet management for last-mile delivery using computer vision and edge computing on existing vehicles.", location: "Detroit, MI", model: "Usage-Based", initial: "F", matchReason: null, category: "company" },
{ name: "Nina Kapoor", sector: "LegalTech", stage: "Seed", description: "Former BigLaw partner building AI contract analysis tools. Identifies risk clauses and suggests negotiation strategies.", location: "Philadelphia, PA", model: "Founder & CEO", initial: "N", matchReason: null, category: "founder" },
{ name: "Bloom Finance", sector: "Fintech", stage: "Pre-Seed", description: "Micro-investment platform for Gen Z that rounds up purchases and invests in curated ESG-focused portfolios.", location: "Brooklyn, NY", model: "Consumer", initial: "B", matchReason: null, category: "company" },
{ name: "Sanjay Mehta", sector: "Enterprise AI", stage: "Series A–B", description: "Former VP Product at Databricks. Advises startups on enterprise go-to-market, pricing strategy, and product-led sales.", location: "Palo Alto, CA", model: "Advisory", initial: "S", matchReason: "Matches your sector", category: "operator" },
{ name: "Kat Williams", sector: "People & Culture", stage: "Seed–Series A", description: "Head of People operator. Built HR from zero at four venture-backed startups. Expert in early-stage culture design and comp frameworks.", location: "Denver, CO", model: "Fractional", initial: "K", matchReason: null, category: "operator" }];


// ── All entries (combined) ──
const ALL_ENTRIES: DirectoryEntry[] = [...SUGGESTED_ENTRIES, ...TRENDING_ENTRIES, ...EXTRA_ENTRIES];

function filterByScope(entries: DirectoryEntry[], scope: EntityScope): DirectoryEntry[] {
  if (scope === "all") return entries;
  const catMap: Record<string, EntryCategory> = { founders: "founder", investors: "investor", companies: "company", operators: "operator" };
  const cat = catMap[scope];
  return entries.filter((e) => e.category === cat);
}

const SCOPE_LABELS: Record<EntityScope, {singular: string;plural: string;}> = {
  all: { singular: "entry", plural: "entries" },
  founders: { singular: "founder", plural: "founders" },
  operators: { singular: "operator", plural: "operators" },
  investors: { singular: "investor", plural: "investors" },
  companies: { singular: "company", plural: "companies" }
};

const CAROUSEL_TITLES: Record<EntityScope, {suggested: string;trending: string;}> = {
  all: { suggested: "Suggested for You", trending: "Trending Now" },
  founders: { suggested: "Suggested Founders", trending: "Trending Founders" },
  operators: { suggested: "Suggested Operators", trending: "Trending Operators" },
  investors: { suggested: "Suggested Investors", trending: "Trending Investors" },
  companies: { suggested: "Suggested Companies", trending: "Trending Companies" }
};

const PAGE_SIZE = 9;

const normalizeFirmName = (name: string) =>
  name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const getAliasKeys = (normalizedName: string) => {
  const keys = [normalizedName];
  if (normalizedName.includes("andreessenhorowitz")) keys.push("a16z");
  if (normalizedName === "a16z") keys.push("andreessenhorowitz");
  return keys;
};

const deriveWebsiteUrlFromFirmId = (firmId?: string | null): string | null => {
  if (!firmId) return null;
  const normalized = firmId.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;
  return `https://${normalized}`;
};

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

  operators: [
  "VP Eng with SaaS scaling experience",
  "Fractional CFOs for Seed startups",
  "Growth leads from fintech",
  "COOs who've scaled past Series A"],

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
{ id: "companies", label: "Companies", icon: Building2 },
{ id: "founders", label: "Founders", icon: Users },
{ id: "operators", label: "Operators", icon: UserCog },
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

  operators: [
  'Search operators or try "VP Eng scaling SaaS..."',
  'Try "Fractional CFOs for early-stage startups..."'],

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

// ── Investor Card ──
function InvestorCard({ founder, trending, onClick, onDeployingClick }: {founder: DirectoryEntry; trending?: boolean; onClick?: () => void; onDeployingClick?: () => void;}) {
  const websiteUrl = founder._websiteUrl || null;
  const logoUrl = founder._logoUrl || null;
  const sentimentScore = founder._founderSentimentScore;
  const sentimentColor = sentimentScore != null ? (sentimentScore >= 70 ? "text-success" : sentimentScore >= 40 ? "text-warning" : "text-destructive") : "text-muted-foreground";
  const matchScore = founder._matchScore ?? Math.floor(Math.random() * 30 + 60); // placeholder until real user-specific score
  const matchColor = matchScore >= 75 ? "text-success" : matchScore >= 50 ? "text-warning" : "text-destructive";

  return (
    <Card
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
      trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"}`
      }>
      <CardContent className="p-4 space-y-3">
        {/* ── Row 1: Logo left, Alerts right ── */}
        <div className="flex items-start justify-between gap-3">
          {/* Logo */}
          <FirmLogo
            firmName={founder.name}
            logoUrl={logoUrl}
            websiteUrl={websiteUrl}
            size="lg"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          />

          {/* Upper right: deploying status + scores */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {founder._isActivelyDeploying !== false && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeployingClick?.();
                      }}
                      className="inline-flex items-center"
                    >
                      <Badge className="text-[8px] font-light px-2 py-1 bg-success/5 text-success border border-success/30 rounded-sm uppercase tracking-wider hover:bg-success/8 transition-colors">
                        <span className="relative flex h-1.5 w-1.5 mr-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-success" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                        </span>
                        Deploying
                      </Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] bg-popover/95 backdrop-blur-md p-2.5">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Actively Deploying</span> — This fund is currently writing checks and evaluating new deals. Click to view their recent activity.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center cursor-help">
                      <span className={`text-sm font-black leading-none ${matchColor}`}>{matchScore}%</span>
                      <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Match</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] bg-popover/95 backdrop-blur-md p-3 space-y-1.5 shadow-lg border border-border">
                    <p className="text-xs font-bold text-foreground">Structural Fit Score</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Measures alignment between your company profile and this investor&apos;s thesis across sector, stage, geography, and check size using vector similarity.
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/70 bg-secondary/50 rounded px-1.5 py-1">
                      {"= cosine_sim(sector) \u00D7 stage_match \u00D7 geo_fit \u00D7 check_range"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {sentimentScore != null && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col items-center cursor-help">
                        <span className={`text-sm font-black leading-none ${sentimentColor}`}>{sentimentScore}%</span>
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Reputation</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px] bg-popover/95 backdrop-blur-md p-3 space-y-1.5 shadow-lg border border-border">
                      <p className="text-xs font-bold text-foreground">Founder Reputation Score</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Aggregated from founder reviews, NPS ratings, and response-rate data across our network. Higher scores indicate responsive, transparent, and founder-friendly investors.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/70 bg-secondary/50 rounded px-1.5 py-1">
                        {"= avg(NPS) \u00D7 response_rate \u00D7 recency_weight"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Name + badges + description ── */}
        <div>
          <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors">{founder.name}</h3>
          <VCBadgeContainer vc_firm={{
            is_trending: (founder as any)._isTrending,
            is_popular: (founder as any)._isPopular,
            is_recent: (founder as any)._isRecent,
          }} />
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{founder.description}</p>
        </div>

        {/* ── Row 3: HQ · AUM · Headcount · Type ── */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex-wrap">
          {founder.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 shrink-0" /> {founder.location || "—"}
            </span>
          )}
          {(founder._aum || founder.model) && (
            <span className="inline-flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5 shrink-0" /> {founder._aum || founder.model}
            </span>
          )}
          {founder._headcount && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-2.5 w-2.5 shrink-0" /> {founder._headcount}
            </span>
          )}
          <Badge variant="outline" className="text-[8px] font-semibold px-1.5 py-0">
            {founder._firmType || "Institutional"}
          </Badge>
        </div>
      </CardContent>
    </Card>);
}

function FounderCard({ founder, trending, onClick, onDeployingClick }: {founder: DirectoryEntry;trending?: boolean;onClick?: () => void; onDeployingClick?: () => void;}) {
  // Use specialized investor card for investor entries
  if (founder.category === "investor") {
    return <InvestorCard founder={founder} trending={trending} onClick={onClick} onDeployingClick={onDeployingClick} />;
  }

  const isPersonProfile = founder.category === "founder" && (founder._isRealProfile || founder.category === "founder");
  
  return (
    <Card
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
      trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"}`
      }>
      {/* Color banner */}
      <div className={`h-10 ${trending ? "bg-gradient-to-r from-accent/10 to-primary/5" : founder._isRealProfile ? "bg-gradient-to-r from-primary/10 to-accent/5" : "bg-gradient-to-r from-muted to-secondary/30"}`} />
      <CardContent className="p-5 -mt-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border-2 border-background shadow-sm text-sm font-bold text-muted-foreground shrink-0">
            {founder._isRealProfile ? (
              <Users className="h-4 w-4 text-primary" />
            ) : (
              founder.initial
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end mt-2">
            {founder._isRealProfile && (
              <Badge className="text-[9px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified
              </Badge>
            )}
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
          {founder._isRealProfile && founder.model && (
            <p className="text-[11px] font-medium text-muted-foreground">{founder.model}</p>
          )}
          {founder._companyName && (
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="h-3 w-3 text-accent/70" />
              <span className="text-[11px] font-semibold text-accent">{founder._companyName}</span>
            </div>
          )}
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
function CarouselCard({ founder, trending, onClick, onDeployingClick }: {founder: DirectoryEntry;trending?: boolean;onClick?: () => void; onDeployingClick?: () => void;}) {
  return (
    <div className="min-w-[300px] w-80 shrink-0 snap-start">
      <FounderCard founder={founder} trending={trending} onClick={onClick} onDeployingClick={onDeployingClick} />
    </div>);

}


export function CommunityView({ companyData, analysisResult, onNavigateProfile, variant = "directory" }: CommunityViewProps) {
  const isInvestorSearch = variant === "investor-search";
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activeInvestorTab, setActiveInvestorTab] = useState<string>("all");
  const [activeScope, setActiveScope] = useState<EntityScope>(isInvestorSearch ? "investors" : "all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<DirectoryEntry | null>(null);
  const [selectedInvestor, setSelectedInvestor] = useState<DirectoryEntry | null>(null);
  const [selectedVCFirm, setSelectedVCFirm] = useState<VCFirm | null>(null);
  const [selectedVCPerson, setSelectedVCPerson] = useState<VCPerson | null>(null);
  const [investorInitialTab, setInvestorInitialTab] = useState<"Updates" | "Activity">("Updates");
  const sentinelRef = useRef<HTMLDivElement>(null);

  // VC Directory: 2,805 firms + 5,247 people from JSON
  const {
    firms: vcFirms, people: vcPeople, loading: vcLoading,
    firmMap, getFirmById, getPartnersForFirm: getVCPartners, getFirmForPerson,
  } = useVCDirectory();

  // Real founder profiles from database
  const { founders: realFounders, loading: foundersLoading } = useFounderProfiles();

  // DB-backed investor data for enrichment (firm_type, deploying status, sentiment, headcount)
  const { data: dbInvestors } = useInvestorDirectory();

  // Build lookup maps with normalized keys and aliases
  const dbInvestorMap = useMemo(() => {
    const m = new Map<string, any>();
    if (dbInvestors) {
      for (const inv of dbInvestors) {
        const normalized = normalizeFirmName(inv.name);
        for (const key of getAliasKeys(normalized)) m.set(key, inv);
      }
    }
    return m;
  }, [dbInvestors]);

  const vcFirmMap = useMemo(() => {
    const m = new Map<string, VCFirm>();
    for (const firm of vcFirms) {
      const normalized = normalizeFirmName(firm.name);
      for (const key of getAliasKeys(normalized)) m.set(key, firm);
    }
    return m;
  }, [vcFirms]);

  const getDbMatch = useCallback(
    (name: string) => dbInvestorMap.get(normalizeFirmName(name)) ?? null,
    [dbInvestorMap]
  );

  const getVCFirmMatch = useCallback(
    (name: string) => vcFirmMap.get(normalizeFirmName(name)) ?? null,
    [vcFirmMap]
  );

  // Merge VC JSON firms into the directory entries for grid display
  // Store the original VCFirm ref so we can do exact sector matching later
  const vcEntries = useMemo(() => {
    const seedNames = new Set(ALL_ENTRIES.filter(e => e.category === "investor").map(e => e.name.toLowerCase()));
    return vcFirms
      .filter(f => !seedNames.has(f.name.toLowerCase()))
      .map(f => {
        const dbMatch = getDbMatch(f.name);
        const fallbackWebsite = f.website_url || deriveWebsiteUrlFromFirmId(f.id);

        return {
          name: f.name,
          sector: f.sectors?.slice(0, 2).join(", ") || "Multi-stage",
          stage: f.stages?.join(", ") || "Multi-stage",
          description: f.description || `${f.name} is an active investment firm.`,
          location: dbMatch?.location || "",
          model: f.sweet_spot || f.aum || "",
          initial: f.name.charAt(0).toUpperCase(),
          matchReason: null,
          category: "investor" as const,
          _sectors: f.sectors || [] as string[],
          _stages: f.stages || [] as string[],
          _firmType: (dbMatch as any)?.firm_type || "Institutional",
          _isActivelyDeploying: (dbMatch as any)?.is_actively_deploying ?? true,
          _founderSentimentScore: (dbMatch as any)?.founder_reputation_score ?? null,
          _headcount: (dbMatch as any)?.headcount ?? null,
          _aum: f.aum || (dbMatch as any)?.aum || null,
          _logoUrl: (dbMatch as any)?.logo_url || f.logo_url || null,
          _isTrending: (dbMatch as any)?.is_trending ?? false,
          _isPopular: (dbMatch as any)?.is_popular ?? false,
          _isRecent: (dbMatch as any)?.is_recent ?? false,
          _firmId: (dbMatch as any)?.id || f.id || null,
          _websiteUrl: (dbMatch as any)?.website_url || fallbackWebsite || null,
        };
      });
  }, [vcFirms, getDbMatch]);

  // Convert real founder profiles to DirectoryEntry format
  const realFounderEntries: DirectoryEntry[] = useMemo(() => {
    return realFounders.map(f => ({
      name: f.full_name || "Unknown Founder",
      sector: f.company_sector || "—",
      stage: f.company_stage || "—",
      description: f.bio || (f.company_name ? `Building ${f.company_name}` : "Founder"),
      location: f.location || "",
      model: f.title || "Founder",
      initial: (f.full_name || "?").charAt(0).toUpperCase(),
      matchReason: null,
      category: "founder" as const,
      _sectors: [] as string[],
      _stages: [] as string[],
      _isRealProfile: true,
      _companyName: f.company_name,
      _profileId: f.id,
    }));
  }, [realFounders]);

  const mergedEntries = useMemo(() => {
    return [
      ...realFounderEntries,
      ...ALL_ENTRIES.map(e => {
        if (e.category !== "investor") {
          return {
            ...e,
            _sectors: [] as string[],
            _stages: [] as string[],
          };
        }

        const dbMatch = getDbMatch(e.name);
        const vcMatch = getVCFirmMatch(e.name);
        const fallbackWebsite = vcMatch?.website_url || deriveWebsiteUrlFromFirmId(vcMatch?.id);

        return {
          ...e,
          _sectors: [] as string[],
          _stages: [] as string[],
          _isTrending: (dbMatch as any)?.is_trending ?? false,
          _isPopular: (dbMatch as any)?.is_popular ?? false,
          _isRecent: (dbMatch as any)?.is_recent ?? false,
          _firmId: (dbMatch as any)?.id ?? vcMatch?.id ?? null,
          _websiteUrl: (dbMatch as any)?.website_url ?? e._websiteUrl ?? fallbackWebsite ?? null,
          _logoUrl: (dbMatch as any)?.logo_url ?? e._logoUrl ?? null,
        };
      }),
      ...vcEntries,
    ];
  }, [vcEntries, realFounderEntries, getDbMatch, getVCFirmMatch]);

  const hasProfile = !!companyData?.name;

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

  // Cohort click handler — filter results
  const handleCohortClick = useCallback((filterKey: string, scopeOverride?: EntityScope) => {
    if (filterKey) {
      setActiveFilter(filterKey);
    }
    if (scopeOverride) setActiveScope(scopeOverride);
  }, []);

  // Reset pagination on filter/scope change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeFilter, activeScope, activeInvestorTab]);

  const scopedAll = filterByScope(mergedEntries, activeScope).filter(e => isInvestorSearch || e.category !== "investor");

  const filteredAll = scopedAll.filter((f) => {
    const filterQ = activeFilter?.toLowerCase() || "";
    const matchesFilter = !filterQ ||
    f.stage.toLowerCase().includes(filterQ) ||
    f.sector.toLowerCase().includes(filterQ) ||
    f.model.toLowerCase().includes(filterQ);
    return matchesFilter;
  });

  // ── Investor tab filtering & sorting ──
  const userStage = companyData?.stage || "";
  const userSector = companyData?.sector || "";

  const investorTabFiltered = useMemo(() => {
    if (!isInvestorSearch) return filteredAll;

    // Only investors for investor-search tabs
    const investors = filteredAll.filter((e) => e.category === "investor");

    switch (activeInvestorTab) {
      case "matches": {
        // Show investors that have a matchReason (simulates AI match scores)
        const matched = investors.filter((e) => e.matchReason);
        // Sort by a pseudo match score: entries with matchReason first, then alphabetically
        return matched.sort((a, b) => {
          // Priority: sector match > stage match > generic
          const scoreA = a.matchReason?.toLowerCase().includes("sector") ? 3 : a.matchReason?.toLowerCase().includes("stage") ? 2 : 1;
          const scoreB = b.matchReason?.toLowerCase().includes("sector") ? 3 : b.matchReason?.toLowerCase().includes("stage") ? 2 : 1;
          return scoreB - scoreA;
        });
      }
      case "stage": {
        if (!userStage) return investors;
        return investors.filter((e) => {
          // Exact match against structured _stages array when available
          if (e._stages && e._stages.length > 0) {
            return e._stages.includes(userStage);
          }
          // Fallback for mock entries
          const stageNorm = userStage.toLowerCase();
          return e.stage.toLowerCase().includes(stageNorm) ||
            e.stage.toLowerCase().split("–").some((s) => s.trim().toLowerCase().includes(stageNorm));
        });
      }
      case "sector": {
        if (!userSector) return investors;
        // Collect all user sectors (primary + secondary from subsectors)
        const userSectors = [userSector];
        if (companyData?.subsectors) {
          userSectors.push(...companyData.subsectors);
        }
        return investors.filter((e) => {
          // Exact match against structured _sectors array when available
          if (e._sectors && e._sectors.length > 0) {
            return e._sectors.some(s => userSectors.includes(s));
          }
          // Fallback for mock entries
          const sectorNorm = userSector.toLowerCase();
          return e.sector.toLowerCase().includes(sectorNorm) ||
            e.description.toLowerCase().includes(sectorNorm);
        });
      }
      case "trending":
        return investors.filter((e) => e._isTrending);
      case "popular":
        return investors.filter((e) => e._isPopular);
      case "recent":
        return investors.filter((e) => e._isRecent);
      default: // "all"
        return investors;
    }
  }, [filteredAll, activeInvestorTab, userStage, userSector, companyData?.subsectors, isInvestorSearch]);

  // Use tab-filtered list for investor-search, otherwise the standard filteredAll
  const displayEntries = isInvestorSearch ? investorTabFiltered : filteredAll;

  const hasMore = visibleCount < displayEntries.length;
  const visibleFounders = displayEntries.slice(0, visibleCount);

  // Dynamic header for investor tabs
  const investorTabHeader = useMemo(() => {
    switch (activeInvestorTab) {
      case "matches":
        return { title: "Your Top Matches", subtitle: "Investors ranked by AI compatibility with your profile" };
      case "stage":
        return userStage
          ? { title: `Investors actively writing ${userStage} checks`, subtitle: `Filtered to funds focused on ${userStage} stage companies` }
          : { title: "Stage-Matched Investors", subtitle: "Set your stage to filter" };
      case "sector":
        return userSector
          ? { title: `Top investors in ${userSector}`, subtitle: `Funds with active thesis in ${userSector}` }
          : { title: "Sector-Matched Investors", subtitle: "Set your sector to filter" };
      case "trending":
        return { title: "Trending Investors", subtitle: "Funds generating the most buzz right now" };
      case "popular":
        return { title: "Popular Investors", subtitle: "Most viewed and saved by founders" };
      case "recent":
        return { title: "Recently Added", subtitle: "Newest additions to the directory" };
      default:
        return { title: "All Investors", subtitle: "The complete investor directory" };
    }
  }, [activeInvestorTab, userStage, userSector]);

  // Missing context detection for smart empty states
  const needsStagePrompt = isInvestorSearch && activeInvestorTab === "stage" && !userStage;
  const needsSectorPrompt = isInvestorSearch && activeInvestorTab === "sector" && !userSector;

  const enrichInvestorSeedEntry = useCallback((entry: DirectoryEntry) => {
    if (entry.category !== "investor") return entry;

    const dbMatch = getDbMatch(entry.name);
    const vcMatch = getVCFirmMatch(entry.name);
    const fallbackWebsite = vcMatch?.website_url || deriveWebsiteUrlFromFirmId(vcMatch?.id);

    return {
      ...entry,
      _isTrending: (dbMatch as any)?.is_trending ?? entry._isTrending ?? false,
      _isPopular: (dbMatch as any)?.is_popular ?? entry._isPopular ?? false,
      _isRecent: (dbMatch as any)?.is_recent ?? entry._isRecent ?? false,
      _firmId: (dbMatch as any)?.id ?? vcMatch?.id ?? entry._firmId ?? null,
      _websiteUrl: (dbMatch as any)?.website_url ?? entry._websiteUrl ?? fallbackWebsite ?? null,
      _logoUrl: (dbMatch as any)?.logo_url ?? entry._logoUrl ?? null,
    };
  }, [getDbMatch, getVCFirmMatch]);

  const scopedSuggested = filterByScope(SUGGESTED_ENTRIES, activeScope)
    .filter(e => isInvestorSearch || e.category !== "investor")
    .map(enrichInvestorSeedEntry);

  const scopedTrending = filterByScope(TRENDING_ENTRIES, activeScope)
    .filter(e => isInvestorSearch || e.category !== "investor")
    .map(enrichInvestorSeedEntry);

  const labels = SCOPE_LABELS[activeScope];
  const carouselTitles = CAROUSEL_TITLES[activeScope];

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    // Simulate network delay for smooth UX
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, displayEntries.length));
      setIsLoadingMore(false);
    }, 400);
  }, [hasMore, isLoadingMore, displayEntries.length]);

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

  // When clicking an investor card, try to resolve VCFirm for rich profile
  const handleInvestorClick = useCallback((entry: DirectoryEntry) => {
    setInvestorInitialTab("Updates");
    const vcMatch = getVCFirmMatch(entry.name);
    if (vcMatch) setSelectedVCFirm(vcMatch);
    setSelectedInvestor(entry);
  }, [getVCFirmMatch]);

  const handleDeployingClick = useCallback((entry: DirectoryEntry) => {
    setInvestorInitialTab("Activity");
    const vcMatch = getVCFirmMatch(entry.name);
    if (vcMatch) setSelectedVCFirm(vcMatch);
    setSelectedInvestor(entry);
  }, [getVCFirmMatch]);

  const logoUrl = (() => {
    try {return localStorage.getItem("company-logo-url") || null;} catch {return null;}
  })();

  return (
    <div className="space-y-2">
      {/* Spacer for global top nav */}
      {variant === "investor-search" && <div className="h-2" />}

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
        {GLOBAL_TABS.filter(tab => tab.id !== "investors").map((tab) => {
          const Icon = tab.icon;
          const isActive = activeScope === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveScope(tab.id);
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

      

      {/* ═══════ Carousel: Suggested ═══════ */}
      {scopedSuggested.length > 0 &&
      <div className="pt-4">
          <FounderCarousel title={carouselTitles.suggested} subtitle="Curated matches based on your profile">
            {scopedSuggested.map((entry, i) =>
          <CarouselCard key={`suggested-${i}`} founder={entry} onClick={() => entry.category === "investor" ? handleInvestorClick(entry) : setSelectedFounder(entry)} onDeployingClick={() => handleDeployingClick(entry)} />
          )}
          </FounderCarousel>
        </div>
      }

      {/* ═══════ Carousel: Trending ═══════ */}
      {scopedTrending.length > 0 &&
      <div className="pt-4">
          <FounderCarousel title={carouselTitles.trending} subtitle="Most active this week">
            {scopedTrending.map((entry, i) =>
          <CarouselCard key={`trending-${i}`} founder={entry} trending onClick={() => entry.category === "investor" ? handleInvestorClick(entry) : setSelectedFounder(entry)} onDeployingClick={() => handleDeployingClick(entry)} />
          )}
          </FounderCarousel>
        </div>
      }

      {/* ═══════ All Grid ═══════ */}
      <div className="space-y-3 pt-4">
          {/* Dynamic header for investor tabs */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {isInvestorSearch ? investorTabHeader.title : `All ${labels.plural.charAt(0).toUpperCase() + labels.plural.slice(1)}`}
              </h2>
              {isInvestorSearch && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{investorTabHeader.subtitle}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {`${visibleFounders.length} of ${displayEntries.length} ${isInvestorSearch ? "investors" : labels.plural}`}
            </span>
          </div>

          {/* Smart empty states for missing profile context */}
          {needsStagePrompt ? (
            <div className="rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-8 text-center">
              <Sparkles className="h-8 w-8 text-accent/50 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">We need your stage to find your matches</h3>
              <p className="text-xs text-muted-foreground mb-4">Set your company stage so we can filter investors writing checks at your level.</p>
              <button
                onClick={onNavigateProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Zap className="h-4 w-4" /> Update Profile Stage
              </button>
            </div>
          ) : needsSectorPrompt ? (
            <div className="rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-8 text-center">
              <Sparkles className="h-8 w-8 text-accent/50 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">We need your sector to surface relevant investors</h3>
              <p className="text-xs text-muted-foreground mb-4">Set your company sector so we can match you with funds that have an active thesis in your space.</p>
              <button
                onClick={onNavigateProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Layers className="h-4 w-4" /> Update Profile Sector
              </button>
            </div>
          ) : visibleFounders.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeInvestorTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleFounders.map((founder, i) =>
                    <FounderCard key={`all-${i}`} founder={founder} onClick={() => founder.category === "investor" ? handleInvestorClick(founder) : setSelectedFounder(founder)} onDeployingClick={() => handleDeployingClick(founder)} />
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
                      Load more
                    </button>
                  </div>
                }
                {isLoadingMore &&
                  <div className="flex justify-center pt-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                }
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                <Search className="h-7 w-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {isInvestorSearch && activeInvestorTab === "matches"
                  ? "No Matches Yet"
                  : "Entity Not Found"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {isInvestorSearch && activeInvestorTab === "matches"
                  ? "Update your company profile to unlock AI-driven investor matching."
                  : `No ${isInvestorSearch ? "investors" : labels.plural} match your current criteria. Try adjusting your filters.`}
              </p>
              {isInvestorSearch && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("navigate-view", { detail: "investors" }));
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90 transition-colors shadow-sm"
                >
                  <Zap className="h-3.5 w-3.5" /> Add to cap table manually
                </button>
              )}
            </div>
          )}
        </div>

      {/* Detail Panels */}
      <FounderDetailPanel
        founder={selectedFounder}
        companyName={companyData?.name}
        onClose={() => setSelectedFounder(null)} />
      <InvestorDetailPanel
        investor={selectedInvestor ? { ...selectedInvestor, category: "investor" as const } : null}
        companyName={companyData?.name}
        companyData={companyData ? { name: companyData.name, sector: companyData.sector, stage: companyData.stage, model: companyData.businessModel?.join(", "), description: companyData.description } : null}
        onClose={() => { setSelectedInvestor(null); setInvestorInitialTab("Updates"); }}
        initialTab={investorInitialTab}
        vcFirm={selectedVCFirm}
        vcPartners={selectedVCFirm ? getVCPartners(selectedVCFirm.id) : []}
        onSelectPerson={(person) => {
          setSelectedInvestor(null);
          setSelectedVCFirm(null);
          setTimeout(() => setSelectedVCPerson(person), 200);
        }}
        onCloseVCFirm={() => setSelectedVCFirm(null)}
      />
      <PersonProfileModal
        person={selectedVCPerson}
        firm={selectedVCPerson ? getFirmForPerson(selectedVCPerson.id) : null}
        onClose={() => setSelectedVCPerson(null)}
        onNavigateToFirm={(firmId) => {
          const firm = getFirmById(firmId);
          setSelectedVCPerson(null);
          if (firm) {
            setTimeout(() => setSelectedVCFirm(firm), 200);
          }
        }}
      />
      
    </div>);

}
