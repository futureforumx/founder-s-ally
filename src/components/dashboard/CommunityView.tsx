import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Users, Building2, MapPin, Sparkles, Briefcase, Handshake, Layers,
  ArrowRight, Flame, Loader2, LayoutGrid, Zap, TrendingUp, UserCog, CheckCircle2,
  Activity, Heart, Info, ChevronDown, X, ArrowDownWideNarrow, Pencil,
  Landmark,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VCBadgeContainer } from "@/components/investor-match/VCBadgeContainer";
import { FirmLogo } from "@/components/ui/firm-logo";
import {
  useInvestorDirectory,
  useInvestorPeopleDirectory,
  mapDbInvestor,
  type LiveInvestorEntry,
} from "@/hooks/useInvestorDirectory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";
import { useVCDirectory, type VCFirm, type VCPerson } from "@/hooks/useVCDirectory";
import { useCommunityGridData } from "@/hooks/useCommunityGridData";
import type { FounderProfile } from "@/hooks/useProfile";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { FounderCarousel } from "./FounderCarousel";
import { InvestorSuggestedTrendingRails } from "./InvestorSuggestedTrendingRails";
import type { InvestorPreviewModel } from "./InvestorPreviewRow";
import { computeDealVelocityScore } from "./InvestorPreviewRow";
import { FounderDetailPanel } from "./FounderDetailPanel";
import { InvestorDetailPanel } from "./InvestorDetailPanel";
import { PersonProfileModal } from "./PersonProfileModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NETWORK_SURFACE_DISPLAY_NAME } from "@/lib/networkNavVariant";
import { cn } from "@/lib/utils";
import { resolveAumBandFromUsd, AUM_BAND_LABELS, AUM_BAND_RANGES } from "@/lib/aumBand";
import { formatStageForDisplay, normalizeStageKey, STAGE_ORDER, stageRank, collapseStagesToRange } from "@/lib/stageUtils";
import { buildOperatorFooterMidDot } from "@/lib/operatorDirectoryDisplay";
import { investorPrimaryAvatarUrl } from "@/lib/investorAvatarUrl";
import { investorFocusBadgeFromDirectoryFields } from "@/lib/investorFocusBadge";
import { displayFundingStatus, displayInvestmentStage } from "@/lib/organizationFundingEnums";
import { resolveDirectoryFirmTypeKey } from "@/lib/resolveDirectoryFirmType";
import { firmDisplayNameMatchesQuery, personDisplayNameMatchesQuery } from "@/lib/firmSearchNormalize";
import { rpcSearchFirmRecords } from "@/lib/firmSearchRpc";
import type { AumBand } from "@prisma/client";
import { toast } from "sonner";
import { isSupabaseConfigured, supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
  onNavigateProfile?: () => void;
  variant?: "directory" | "investor-search";
  /** When set (e.g. from GlobalTopNav), grid filter tracks this tab */
  investorTab?: string;
  /** Narrows investor grid by free text (from nav search) */
  investorListSearchQuery?: string;
  /** When `nonce` changes, scrolls the investor grid to the matching firm card (VC directory id). */
  investorScrollTo?: { vcFirmId: string; nonce: number } | null;
  /** Pin the directory to a specific scope on first render (e.g. "operators" for the Network tab). */
  initialScope?: EntityScope;
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
  /** `firm_records` — strategy tag array (Postgres enum values). */
  _strategyClassifications?: string[] | null;
  _thesisOrientation?: string | null;
  _sectorScope?: string | null;
  _thesisVerticals?: string[] | null;
  _geoFocus?: string[] | null;
  /** VC JSON sectors when no DB verticals (single sector → specialist pill). */
  _seedSectors?: string[] | null;
  _isActivelyDeploying?: boolean;
  _founderSentimentScore?: number | null;
  _headcount?: string | null;
  _aum?: string | null;
  /** Derived from `_aum` only (Nano → Mega tiers). */
  _aumBand?: string | null;
  _logoUrl?: string | null;
  _matchScore?: number | null;
  _firmId?: string | null;
  _vcFirmId?: string | null;
  _websiteUrl?: string | null;
  _linkedinUrl?: string | null;
  _twitterUrl?: string | null;
  _isTrending?: boolean;
  _isPopular?: boolean;
  _isRecent?: boolean;
  /** Deal velocity score (0–100) derived from recent deal count. */
  _dealVelocityScore?: number | null;
  /** News-derived funding activity (0–100) when present on `firm_records` / `firm_investors`. */
  _fundingIntelActivity?: number | null;
  /** Company — organizations.fundingStatus */
  _fundingStatus?: string | null;
  /** Company — organizations.vcBacked */
  _vcBacked?: boolean | null;
  /** Company — organizations.investmentStage (not YC cohort). */
  _investmentStage?: string | null;
  /** Company rows only — numeric employee count for directory sorting. */
  _employeeCount?: number | null;
  /** Operator hub — primary sector pill (from `sector_focus`, best-effort). */
  _operatorPrimarySector?: string | null;
  /** Operator hub — inferred function track (Product, Sales, …). */
  _operatorFunctionLabel?: string | null;
  /** Raw expertise tags from operator_profiles (footer fallbacks). */
  _operatorExpertise?: string[] | null;
  /** prior_companies from operator_profiles (excluding current employer when possible). */
  _operatorPriorCompanies?: string[] | null;
  /** current_company_name from operator_profiles (subtitle + footer). */
  _operatorCurrentCompany?: string | null;
  _investorEntityType?: "firm" | "person";
  _investorFirmName?: string | null;
  _personData?: VCPerson | null;
  _personFirm?: VCFirm | null;
  competitors?: string[];
}

function isInvestorPersonEntry(entry: DirectoryEntry): boolean {
  return entry.category === "investor" && entry._investorEntityType === "person" && Boolean(entry._personData);
}

function isUuid(value: string | null | undefined): value is string {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

type AdminEditableRecord =
  | {
      type: "firm";
      id: string;
      name: string;
      website_url: string | null;
      location: string | null;
      description: string | null;
      firm_type: string | null;
      aum: string | null;
    }
  | {
      type: "investor";
      id: string;
      full_name: string;
      title: string | null;
      email: string | null;
      linkedin_url: string | null;
      x_url: string | null;
      bio: string | null;
    };

function getAdminEditableRecord(entry: DirectoryEntry): AdminEditableRecord | null {
  if (entry.category !== "investor") return null;
  if (entry._investorEntityType === "person" && isUuid(entry._personData?.id)) {
    return {
      type: "investor",
      id: String(entry._personData.id).trim(),
      full_name: entry._personData.full_name ?? entry.name,
      title: entry._personData.title ?? entry.model ?? null,
      email: entry._personData.email ?? null,
      linkedin_url: entry._personData.linkedin_url ?? null,
      x_url: entry._personData.x_url ?? null,
      bio: entry._personData.bio ?? entry.description ?? null,
    };
  }
  if (isUuid(entry._firmId)) {
    return {
      type: "firm",
      id: String(entry._firmId).trim(),
      name: entry.name,
      website_url: entry._websiteUrl ?? null,
      location: entry.location || null,
      description: entry.description || null,
      firm_type: entry._firmType ?? null,
      aum: entry._aum ?? null,
    };
  }
  return null;
}

function sanitizeOptionalField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function AdminRecordEditDialog({
  record,
  open,
  onOpenChange,
  onSaved,
}: {
  record: AdminEditableRecord | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [firmWebsite, setFirmWebsite] = useState("");
  const [firmLocation, setFirmLocation] = useState("");
  const [firmDescription, setFirmDescription] = useState("");
  const [firmType, setFirmType] = useState("");
  const [firmAum, setFirmAum] = useState("");

  const [investorName, setInvestorName] = useState("");
  const [investorTitle, setInvestorTitle] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [investorLinkedin, setInvestorLinkedin] = useState("");
  const [investorXUrl, setInvestorXUrl] = useState("");
  const [investorBio, setInvestorBio] = useState("");

  useEffect(() => {
    if (!record) return;
    if (record.type === "firm") {
      setFirmName(record.name);
      setFirmWebsite(record.website_url ?? "");
      setFirmLocation(record.location ?? "");
      setFirmDescription(record.description ?? "");
      setFirmType(record.firm_type ?? "");
      setFirmAum(record.aum ?? "");
      return;
    }
    setInvestorName(record.full_name);
    setInvestorTitle(record.title ?? "");
    setInvestorEmail(record.email ?? "");
    setInvestorLinkedin(record.linkedin_url ?? "");
    setInvestorXUrl(record.x_url ?? "");
    setInvestorBio(record.bio ?? "");
  }, [record]);

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      if (record.type === "firm") {
        const cleanName = firmName.trim();
        if (!cleanName) {
          toast.error("Firm name is required.");
          return;
        }
        const { error } = await supabase
          .from("firm_records")
          .update({
            firm_name: cleanName,
            website_url: sanitizeOptionalField(firmWebsite),
            location: sanitizeOptionalField(firmLocation),
            description: sanitizeOptionalField(firmDescription),
            firm_type: sanitizeOptionalField(firmType),
            aum: sanitizeOptionalField(firmAum),
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
        if (error) throw error;
        toast.success("Firm record updated.");
      } else {
        const cleanName = investorName.trim();
        if (!cleanName) {
          toast.error("Investor name is required.");
          return;
        }
        const { error } = await supabase
          .from("firm_investors")
          .update({
            full_name: cleanName,
            title: sanitizeOptionalField(investorTitle),
            email: sanitizeOptionalField(investorEmail),
            linkedin_url: sanitizeOptionalField(investorLinkedin),
            x_url: sanitizeOptionalField(investorXUrl),
            bio: sanitizeOptionalField(investorBio),
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
        if (error) throw error;
        toast.success("Investor record updated.");
      }

      await onSaved();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update record.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{record?.type === "investor" ? "Edit Investor Record" : "Edit Firm Record"}</DialogTitle>
          <DialogDescription>
            Changes are applied directly to the live directory record.
          </DialogDescription>
        </DialogHeader>
        {record?.type === "firm" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="firm-name">Firm Name</Label>
              <Input id="firm-name" value={firmName} onChange={(e) => setFirmName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="firm-website">Website</Label>
              <Input id="firm-website" value={firmWebsite} onChange={(e) => setFirmWebsite(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="firm-location">Location</Label>
              <Input id="firm-location" value={firmLocation} onChange={(e) => setFirmLocation(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="firm-type">Firm Type</Label>
              <Input id="firm-type" value={firmType} onChange={(e) => setFirmType(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="firm-aum">AUM</Label>
              <Input id="firm-aum" value={firmAum} onChange={(e) => setFirmAum(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="firm-description">Description</Label>
              <Textarea
                id="firm-description"
                value={firmDescription}
                onChange={(e) => setFirmDescription(e.target.value)}
                rows={4}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="investor-name">Investor Name</Label>
              <Input id="investor-name" value={investorName} onChange={(e) => setInvestorName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor-title">Title</Label>
              <Input id="investor-title" value={investorTitle} onChange={(e) => setInvestorTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor-email">Email</Label>
              <Input id="investor-email" value={investorEmail} onChange={(e) => setInvestorEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor-linkedin">LinkedIn</Label>
              <Input
                id="investor-linkedin"
                value={investorLinkedin}
                onChange={(e) => setInvestorLinkedin(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor-x">X URL</Label>
              <Input id="investor-x" value={investorXUrl} onChange={(e) => setInvestorXUrl(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="investor-bio">Bio</Label>
              <Textarea id="investor-bio" value={investorBio} onChange={(e) => setInvestorBio(e.target.value)} rows={4} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Legacy demo directory rows were removed — Network uses Supabase-backed hooks (`useCommunityGridData`). */

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
  all: { suggested: "Suggested for You", trending: "Trending now" },
  founders: { suggested: "Suggested Founders", trending: "Trending Founders" },
  operators: { suggested: "Suggested Operators", trending: "Trending Operators" },
  investors: { suggested: "Suggested Investors", trending: "Trending Investors" },
  companies: { suggested: "Suggested Companies", trending: "Trending Companies" }
};

const PAGE_SIZE = 9;
/** Investor grid: show more than one screen initially so mid-alphabet firms are reachable without many “Load more” taps. */
const INVESTOR_DIRECTORY_INITIAL_VISIBLE = 120;
/** Larger chunk when loading the investor directory (firms far in A–Z order). */
const INVESTOR_DIRECTORY_LOAD_MORE = 96;

const normalizeFirmName = (name: string | null | undefined) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** DB/JSON sometimes returns numbers or other primitives — never call `.trim()` on unknown values. */
function safeTextTrim(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

const getAliasKeys = (normalizedName: string) => {
  const keys = [normalizedName];
  if (normalizedName.includes("andreessenhorowitz")) keys.push("a16z");
  if (normalizedName === "a16z") keys.push("andreessenhorowitz");
  return keys;
};

const normalizeWebsiteHost = (websiteUrl?: string | null) => {
  const raw = safeTextTrim(websiteUrl);
  if (!raw) return null;
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
};

function isInvestorTrendingMerged(
  dbIsTrending: boolean | null | undefined,
  seedIsTrending: boolean,
  _firmName: string,
): boolean {
  return dbIsTrending === true || seedIsTrending;
}

const deriveWebsiteUrlFromFirmId = (firmId?: string | null): string | null => {
  const raw = safeTextTrim(firmId);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/^https?:\/\//, "");
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

/** Largest AUM figure in millions USD from strings like "$42B", "$1.5B", "$850M", "$500K". */
function parseAumToMillions(raw: string | null | undefined): number | null {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const s = str.replace(/,/g, "").toLowerCase();
  let maxM = 0;
  const re = /\$\s*([\d.]+)\s*([bmk])(?![a-z])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = parseFloat(m[1]);
    if (Number.isNaN(n)) continue;
    const u = m[2].toLowerCase();
    const millions = u === "b" ? n * 1000 : u === "m" ? n : n / 1000;
    maxM = Math.max(maxM, millions);
  }
  return maxM > 0 ? maxM : null;
}

/** Card badge text for each `AumBand` (thresholds: `src/lib/aumBand.ts`). */
const INVESTOR_CARD_AUM_BADGE: Record<AumBand, string> = {
  NANO: "NANO",
  MICRO: "MICRO",
  SMALL: "SMALL",
  MID_SIZE: "MID-SIZE",
  LARGE: "LARGE",
  MEGA_FUND: "MEGA",
};

/** AUM band from parsed `_aum` only (not check size in `model`). */
function investorAumBandLabel(aum: string | null | undefined): string | null {
  const mm = parseAumToMillions(aum);
  if (mm == null) return null;
  const band = resolveAumBandFromUsd(mm * 1_000_000);
  return band ? INVESTOR_CARD_AUM_BADGE[band] : null;
}

/** Same card shape as `dbOnlyFirmEntries` — used when merging `search_firm_records` RPC hits into the grid. */
function directoryEntryFromLiveInvestor(inv: LiveInvestorEntry): DirectoryEntry {
  return {
    name: inv.name,
    sector: inv.sector || "Generalist",
    stage: inv.stage || "Multi-stage",
    description: inv.description,
    location: inv.location || "",
    model: inv.model || "",
    initial: inv.initial,
    matchReason: null,
    category: "investor",
    _sectors: [] as string[],
    _stages: [] as string[],
    _firmType: inv.firm_type ?? resolveDirectoryFirmTypeKey(inv.name, null),
    _strategyClassifications: inv.strategy_classifications ?? null,
    _thesisOrientation: inv.thesis_orientation ?? null,
    _sectorScope: inv.sector_scope ?? null,
    _thesisVerticals: inv.thesis_verticals ?? [],
    _geoFocus: inv.geo_focus ?? null,
    _seedSectors: null,
    _isActivelyDeploying: inv.is_actively_deploying === true,
    _founderSentimentScore: inv.founder_reputation_score ?? null,
    _headcount: inv.headcount ?? null,
    _aum: inv.aum ?? null,
    _aumBand: investorAumBandLabel(inv.aum ?? null),
    _logoUrl: inv.logo_url ?? null,
    _isTrending: inv.is_trending ?? false,
    _isPopular: inv.is_popular ?? false,
    _isRecent: inv.is_recent ?? false,
    _firmId: inv.id,
    _websiteUrl: inv.website_url ?? null,
    _dealVelocityScore: computeDealVelocityScore(
      inv.recent_deals ?? null,
      inv.is_actively_deploying ?? null,
    ),
    _fundingIntelActivity: inv.funding_intel_activity_score ?? null,
  };
}

function aumBandKeyFromCardBadgeLabel(label: string): AumBand | null {
  for (const k of Object.keys(INVESTOR_CARD_AUM_BADGE) as AumBand[]) {
    if (INVESTOR_CARD_AUM_BADGE[k] === label) return k;
  }
  return null;
}

function aumBandBadgeTooltipText(cardLabel: string): string {
  const key = aumBandKeyFromCardBadgeLabel(cardLabel);
  if (!key) {
    return "Tier from reported flagship fund or firm-wide VC assets under management—not individual check size.";
  }
  const human = AUM_BAND_LABELS[key];
  const range = AUM_BAND_RANGES[key];
  return `${human}: ${range}. Derived from the largest AUM figure we parse on this profile.`;
}

function firmLocationBadgeTooltipText(location: string): string {
  return `Firm location: ${location}. Headquarters or primary office for this investor.`;
}

function deploymentStatusBadgeTooltipText(isDeploying: boolean): string {
  if (isDeploying) {
    return "This fund is currently writing checks and evaluating new deals.";
  }
  return "We are not seeing active deployment signals for this firm right now (may still invest opportunistically).";
}

const INVESTOR_CARD_META_BADGE =
  "h-5 min-h-5 max-w-[11rem] cursor-help truncate border-border/60 bg-secondary/30 px-1.5 py-0 text-[7.5px] font-semibold uppercase tracking-[0.07em] text-foreground/90 dark:bg-secondary/35";

const INVESTOR_CARD_DEPLOY_ACTIVE_BADGE =
  `${INVESTOR_CARD_META_BADGE} border-success/40 bg-success/10 text-success dark:text-success`;

const INVESTOR_CARD_DEPLOY_INACTIVE_BADGE =
  `${INVESTOR_CARD_META_BADGE} border-muted-foreground/25 text-muted-foreground`;

/** Spaces around en/em dashes in stage ranges (e.g. Seed–Growth → Seed – Growth). */

function investorSectorStageParts(entry: DirectoryEntry): { sector: string | null; stage: string | null } {
  const sector = safeTextTrim(entry.sector) || null;

  if (entry._stages && entry._stages.length > 0) {
    const collapsed = collapseStagesToRange(entry._stages.map((s) => String(s)));
    return { sector, stage: collapsed ?? null };
  }

  const raw = safeTextTrim(entry.stage);
  if (!raw || raw === "—") return { sector, stage: null };

  if (raw.includes(",")) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const collapsed = collapseStagesToRange(parts);
    return { sector, stage: collapsed ?? formatStageForDisplay(raw) };
  }

  return { sector, stage: formatStageForDisplay(raw) };
}

// ── Investor Card ──
function InvestorCard({
  founder,
  trending,
  onClick,
  onDeployingClick,
  anchorVcFirmId,
  showAdminEdit,
  onAdminEdit,
}: {
  founder: DirectoryEntry;
  trending?: boolean;
  onClick?: () => void;
  onDeployingClick?: () => void;
  /** VC JSON firm id for scroll-to / querySelector anchoring */
  anchorVcFirmId?: string | null;
  showAdminEdit?: boolean;
  onAdminEdit?: () => void;
}) {
  const isPerson = founder._investorEntityType === "person";
  const locationLine = safeTextTrim(founder.location);
  const websiteUrl = founder._websiteUrl || null;
  const logoUrl = founder._logoUrl || null;
  const sentimentScore = founder._founderSentimentScore;
  const sentimentColor = sentimentScore != null ? (sentimentScore >= 70 ? "text-success" : sentimentScore >= 40 ? "text-warning" : "text-destructive") : "text-muted-foreground";
  const matchScore = founder._matchScore ?? Math.floor(Math.random() * 30 + 60); // placeholder until real user-specific score
  const matchColor = matchScore >= 75 ? "text-success" : matchScore >= 50 ? "text-warning" : "text-destructive";
  const aumBand = founder._aumBand ?? investorAumBandLabel(founder._aum);
  const velocityScore = (founder as any)._dealVelocityScore ?? null;
  const velocityColor = velocityScore != null ? (velocityScore >= 70 ? "text-success" : velocityScore >= 40 ? "text-warning" : "text-destructive") : "text-muted-foreground";
  const velocityLabel = velocityScore == null ? null : velocityScore >= 80 ? "Hot" : velocityScore >= 60 ? "Active" : velocityScore >= 35 ? "Moderate" : "Slow";
  const MIN_DEPLOYING_VELOCITY_SCORE = 35;
  /** Only treat as deploying when the firm record explicitly says so (never default unknown/null to true). */
  const showAsActivelyDeploying =
    founder._isActivelyDeploying === true &&
    (velocityScore == null || velocityScore >= MIN_DEPLOYING_VELOCITY_SCORE);
  const { sector: investorSector, stage: investorStage } = investorSectorStageParts(founder);
  const focusBadge = investorFocusBadgeFromDirectoryFields(founder);
  const subtitle = isPerson
    ? [founder.model, founder._investorFirmName].filter(Boolean).join(" · ")
    : null;

  return (
    <Card
      data-vc-firm-id={anchorVcFirmId || undefined}
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
      trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"}`
      }>
      <CardContent className="space-y-2 px-3 py-2.5">
        {/* ── Row 1: Logo left, Alerts right ── */}
        <div className="flex items-start justify-between gap-2.5">
          {/* Logo */}
          {isPerson ? (
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card text-sm font-bold text-muted-foreground shadow-sm">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={founder.name}
                  width={44}
                  height={44}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                founder.initial
              )}
            </div>
          ) : (
            <FirmLogo
              firmName={founder.name}
              logoUrl={logoUrl}
              websiteUrl={websiteUrl}
              size="lg"
              onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            />
          )}

          {/* Upper right: edit + status icons (deploying + trending/popular/recent) */}
          <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-0">
            {showAdminEdit ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdminEdit?.();
                      }}
                      aria-label="Edit record"
                      className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] bg-popover/95 backdrop-blur-md p-2.5">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Admin edit</span> — update this investor or firm record.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {showAsActivelyDeploying ? (
              <div className="-mr-1.5">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeployingClick?.();
                        }}
                        aria-label="Actively deploying"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-success"
                      >
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px] bg-popover/95 backdrop-blur-md p-2.5">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">Actively Deploying</span> — This fund is currently writing checks and evaluating new deals. Click to view their recent activity.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}
            <VCBadgeContainer
              iconOnly
              vc_firm={{
                is_trending: (founder as any)._isTrending,
                is_popular: (founder as any)._isPopular,
                is_recent: (founder as any)._isRecent,
              }}
            />
          </div>
        </div>

        {/* ── Row 2: Name + badges + scores (no long description) ── */}
        <div>
          <h3 className="text-[15px] font-bold leading-tight text-foreground">{founder.name}</h3>
          {subtitle ? (
            <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
          {(investorSector || investorStage) ? (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug">
              {investorSector ? (
                <span className="font-semibold text-foreground/80">{investorSector}</span>
              ) : null}
              {investorSector && investorStage ? (
                <span className="font-normal text-muted-foreground"> · </span>
              ) : null}
              {investorStage ? <span className="text-muted-foreground">{investorStage}</span> : null}
            </p>
          ) : null}
          <div className="mt-1.5 flex items-end gap-5 border-t border-border/35 pt-1.5">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help flex-col items-start">
                    <span className={`text-base font-bold tabular-nums leading-none tracking-tight ${matchColor}`}>
                      {matchScore}%
                    </span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Match</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Structural Fit Score</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Measures alignment between your company profile and this investor&apos;s thesis across sector, stage, geography, and check size using vector similarity.
                  </p>
                  <p className="mt-2 rounded bg-secondary/50 px-1.5 py-1 font-mono text-[10px] text-muted-foreground/70">
                    {"= cosine_sim(sector) \u00D7 stage_match \u00D7 geo_fit \u00D7 check_range"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help flex-col items-start">
                    <span
                      className={`text-base font-bold tabular-nums leading-none tracking-tight ${
                        sentimentScore != null ? sentimentColor : "text-muted-foreground/40"
                      }`}
                    >
                      {sentimentScore != null ? `${sentimentScore}%` : "—"}
                    </span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Reputation</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Founder Reputation Score</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Aggregated from founder reviews, NPS ratings, and response-rate data across our network. Higher scores indicate responsive, transparent, and founder-friendly investors.
                  </p>
                  <p className="mt-2 rounded bg-secondary/50 px-1.5 py-1 font-mono text-[10px] text-muted-foreground/70">
                    {"= avg(NPS) \u00D7 response_rate \u00D7 recency_weight"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {velocityScore != null && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-help flex-col items-start">
                      <span className={`inline-flex items-center gap-0.5 text-base font-bold tabular-nums leading-none tracking-tight ${velocityColor}`}>
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                        {velocityScore}
                      </span>
                      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Velocity</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                    <p className="text-xs font-bold text-foreground">Deal Velocity Score</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      How actively this firm is closing deals right now. Derived from recent deal count over the past 12 months. <strong>{velocityLabel}</strong> — {velocityScore >= 80 ? "closing deals at a high pace" : velocityScore >= 60 ? "actively investing" : velocityScore >= 35 ? "moderate deal flow" : "relatively quiet recently"}.
                    </p>
                    <p className="mt-2 rounded bg-secondary/50 px-1.5 py-1 font-mono text-[10px] text-muted-foreground/70">
                      {"= f(recent_deals, active_deployment)"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* ── Row 3: Firm location · type · size (AUM band) · deployment — badge row + detail line ── */}
        <div className="space-y-1.5 border-t border-border/40 pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <TooltipProvider delayDuration={200}>
              {locationLine ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        INVESTOR_CARD_META_BADGE,
                        "inline-flex max-w-[12rem] items-center gap-0.5 normal-case font-medium tracking-normal",
                      )}
                      aria-label={`Firm location: ${locationLine}`}
                    >
                      <MapPin className="h-2 w-2 shrink-0 opacity-80" aria-hidden />
                      <span className="truncate">
                        {locationLine.length > 34 ? `${locationLine.slice(0, 33)}…` : locationLine}
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                    <p className="text-xs font-bold text-foreground">Firm location</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {firmLocationBadgeTooltipText(locationLine)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={INVESTOR_CARD_META_BADGE}
                    aria-label={`Investment focus: ${focusBadge.pill}`}
                  >
                    {focusBadge.pill}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Investment focus</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {focusBadge.tooltip}
                  </p>
                </TooltipContent>
              </Tooltip>
              {aumBand ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={INVESTOR_CARD_META_BADGE} aria-label={`Firm size (AUM band): ${aumBand}`}>
                      {aumBand}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                    <p className="text-xs font-bold text-foreground">Firm size</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {aumBandBadgeTooltipText(aumBand)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={
                      showAsActivelyDeploying
                        ? cn(INVESTOR_CARD_DEPLOY_ACTIVE_BADGE, "inline-flex items-center gap-0.5")
                        : cn(INVESTOR_CARD_DEPLOY_INACTIVE_BADGE, "inline-flex items-center gap-0.5")
                    }
                    aria-label={
                      showAsActivelyDeploying
                        ? "Actively deploying capital"
                        : "Not actively deploying"
                    }
                  >
                    <Activity className="h-2 w-2 shrink-0" aria-hidden />
                    {showAsActivelyDeploying ? "Actively deploying" : "Not actively deploying"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Deployment status</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {deploymentStatusBadgeTooltipText(showAsActivelyDeploying)}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {(isPerson && founder._investorFirmName) || founder._headcount ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {isPerson && founder._investorFirmName ? (
                <span className="inline-flex items-center gap-1">
                  <Landmark className="h-2.5 w-2.5 shrink-0" /> {founder._investorFirmName}
                </span>
              ) : null}
              {founder._headcount ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-2.5 w-2.5 shrink-0" /> {founder._headcount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>);
}

function operatorPillBadgeText(raw: unknown): string {
  const t = safeTextTrim(raw);
  if (!t) return "—";
  const u = t.toUpperCase();
  return u.length <= 22 ? u : `${u.slice(0, 20).trimEnd()}…`;
}

/** Prefer the longest non-empty sector string as a weak “deepest” signal. */
function operatorPrimarySectorFromProfile(sectors: string[] | null | undefined): string | null {
  const cleaned = (sectors ?? []).map((s) => safeTextTrim(s)).filter(Boolean);
  if (!cleaned.length) return null;
  return cleaned.reduce((a, b) => (b.length > a.length ? b : a), cleaned[0]);
}

const OPERATOR_FUNCTION_MATCHERS: Array<{ label: string; re: RegExp }> = [
  { label: "Dev", re: /\b(engineer|engineering|developer|devops|\bdev\b|sre|software|backend|frontend|full[\s-]?stack|cto|tech lead|architecture|ml engineer|data engineer)\b/i },
  { label: "Product", re: /\b(product manager|product|cpo|chief product|product lead|head of product)\b/i },
  { label: "Sales", re: /\b(sales|revenue|biz dev|business development|\bae\b|\bsdr\b|\bbdr\b|account executive)\b/i },
  { label: "Growth", re: /\b(growth|performance marketing|demand gen|acquisition)\b/i },
  { label: "Marketing", re: /\b(marketing|brand|cmo|content strategy|communications)\b/i },
  { label: "BizOps", re: /\b(bizops|business operations|chief of staff|corp strategy|corporate strategy|strategic ops)\b/i },
  { label: "Finance", re: /\b(finance|cfo|fp&a|controller|accounting)\b/i },
  { label: "People", re: /\b(people ops|people team|\bhr\b|human resources|talent|recruiting|chief people)\b/i },
  { label: "Operations", re: /\b(operations|\bcoo\b|supply chain|logistics|warehouse)\b/i },
  { label: "Legal", re: /\b(legal|general counsel|\bgc\b|counsel)\b/i },
  { label: "Success", re: /\b(customer success|client success|account management)\b/i },
];

function stripCommonJobTitlePrefixes(s: string): string {
  return s
    .replace(/^(vice president|vp|svp|evp|cvp|director|head of|chief|lead|senior|staff|principal|associate)\s+/i, "")
    .trim();
}

function fallbackOperatorTypeFromTitle(title: string | null | undefined): string | null {
  const raw = safeTextTrim(title);
  if (!raw) return null;
  const t = stripCommonJobTitlePrefixes(raw);
  if (!t) return null;
  const words = t.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  if (!words) return null;
  return words.length > 22 ? `${words.slice(0, 20).trimEnd()}…` : words;
}

function operatorPriorCompanyName(prior: string[] | null | undefined): string | null {
  if (!prior?.length) return null;
  const first = safeTextTrim(prior[0]);
  return first || null;
}

function inferOperatorFunctionLabel(
  title: string | null | undefined,
  expertise: string[] | null | undefined,
): string {
  const expParts = (expertise ?? []).map((x) => safeTextTrim(x)).filter(Boolean);
  const corpus = [safeTextTrim(title), ...expParts].join(" ");
  if (corpus) {
    for (const { label, re } of OPERATOR_FUNCTION_MATCHERS) {
      if (re.test(corpus)) return label;
    }
  }
  const firstExp = expParts[0];
  if (firstExp) return firstExp.length > 24 ? `${firstExp.slice(0, 22).trimEnd()}…` : firstExp;
  return fallbackOperatorTypeFromTitle(title) ?? "Operator";
}

/** Operators hub — mirrors InvestorCard chrome without fund-specific fields. */
function OperatorHubCard({
  founder,
  trending,
  onClick,
}: {
  founder: DirectoryEntry;
  trending?: boolean;
  onClick?: () => void;
}) {
  const websiteUrl = founder._websiteUrl || null;
  const logoUrl = founder._logoUrl || null;
  const sentimentScore = founder._founderSentimentScore;
  const sentimentColor =
    sentimentScore != null
      ? sentimentScore >= 70
        ? "text-success"
        : sentimentScore >= 40
          ? "text-warning"
          : "text-destructive"
      : "text-muted-foreground";
  const matchScore = founder._matchScore ?? Math.floor(Math.random() * 30 + 60);
  const matchColor = matchScore >= 75 ? "text-success" : matchScore >= 50 ? "text-warning" : "text-destructive";
  const operatorFooterMid = buildOperatorFooterMidDot(founder);
  const sectorPillSource =
    safeTextTrim(founder._operatorPrimarySector) ||
    (founder._sectors?.length ? safeTextTrim(founder._sectors[0]) : "") ||
    safeTextTrim(founder.sector).split(",")[0]?.trim() ||
    "";
  const sectorPill = operatorPillBadgeText(sectorPillSource || "Generalist");
  const typePill = operatorPillBadgeText(founder._operatorFunctionLabel ?? "Operator");

  return (
    <Card
      onClick={onClick}
      className={`overflow-hidden group transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg ${
        trending ? "border-accent/20 hover:border-accent/40" : "border-border/60 hover:border-accent/30"
      }`}
    >
      <CardContent className="space-y-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <FirmLogo
            firmName={founder.name}
            logoUrl={logoUrl}
            websiteUrl={websiteUrl}
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          />
          <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-0">
            <VCBadgeContainer
              iconOnly
              vc_firm={{
                is_trending: founder._isTrending,
                is_popular: founder._isPopular,
                is_recent: founder._isRecent,
              }}
            />
          </div>
        </div>

        <div>
          <h3 className="text-[15px] font-bold leading-tight text-foreground">{founder.name}</h3>
          {(safeTextTrim(founder.model) || founder._companyName) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {safeTextTrim(founder.model) && (
                <span className="text-[11px] font-medium text-muted-foreground">{founder.model}</span>
              )}
              {founder._companyName ? (
                <>
                  {safeTextTrim(founder.model) ? (
                    <span className="text-[11px] text-muted-foreground/50 italic">at</span>
                  ) : null}
                  <div className="flex min-w-0 max-w-full items-center gap-1 text-accent/90">
                    <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate text-[11px] font-bold tracking-tight">{founder._companyName}</span>
                  </div>
                </>
              ) : null}
            </div>
          )}
          <div className="mt-1.5 flex items-end gap-5 border-t border-border/35 pt-1.5">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help flex-col items-start">
                    <span className={`text-base font-bold tabular-nums leading-none tracking-tight ${matchColor}`}>
                      {matchScore}%
                    </span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Fit
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Operator fit</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    How closely this operator&apos;s experience aligns with your sector, stage, and hiring needs.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help flex-col items-start">
                    <span
                      className={`text-base font-bold tabular-nums leading-none tracking-tight ${
                        sentimentScore != null ? sentimentColor : "text-muted-foreground/40"
                      }`}
                    >
                      {sentimentScore != null ? `${sentimentScore}%` : "—"}
                    </span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Rating
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Peer rating</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Aggregated feedback from founders who have worked with this operator.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground flex-wrap">
          {operatorFooterMid ? (
            <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground/80">
              {operatorFooterMid}
            </span>
          ) : null}
          {safeTextTrim(founder.location) ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 shrink-0" /> {founder.location}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-5 min-h-5 max-w-[9rem] cursor-help truncate border-zinc-400/45 bg-transparent px-1.5 py-0 text-[7.5px] font-light uppercase tracking-[0.1em] text-zinc-600 dark:border-zinc-500/55 dark:text-zinc-300"
                    aria-label={`Sector: ${sectorPillSource || "Generalist"}`}
                  >
                    {sectorPill}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Sector focus</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Primary sector from this operator&apos;s profile (strongest match among their sector tags when
                    multiple are listed).
                  </p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-5 min-h-5 max-w-[9rem] cursor-help truncate border-zinc-400/45 bg-transparent px-1.5 py-0 text-[7.5px] font-light uppercase tracking-[0.1em] text-zinc-600 dark:border-zinc-500/55 dark:text-zinc-300"
                    aria-label={`Operator type: ${safeTextTrim(founder._operatorFunctionLabel) || "Operator"}`}
                  >
                    {typePill}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-xs font-bold text-foreground">Operator type</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Inferred from their headline and expertise tags (e.g. Product, Sales, BizOps, Growth, Dev)—not
                    engagement mode.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCompanyHeadcountDisplay(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n).toLocaleString();
}

/** Type pill: DB fundingStatus + vcBacked, then YC cohort on card only if still unknown. */
function companyTypeLine(entry: DirectoryEntry): string {
  const base = displayFundingStatus(entry._fundingStatus, entry._vcBacked);
  if (base !== "Unknown") return base;
  if ((entry._stages ?? []).some((s) => /^yc\b/i.test(String(s)))) return "VC-backed";
  return "Unknown";
}

/** Network directory — company cards: labeled Stage / Sector / Type / Headcount / HQ. */
function CompanyCardMetricsRow({ founder }: { founder: DirectoryEntry }) {
  const { sector, stage } = investorSectorStageParts(founder);
  const inst = safeTextTrim(founder._investmentStage);
  const stageLine = inst ? displayInvestmentStage(inst) : safeTextTrim(stage) || "—";
  const sectorLine = safeTextTrim(sector) || "—";
  const typeLine = companyTypeLine(founder);
  const hcRaw = founder._headcount != null ? String(founder._headcount).trim() : "";
  const headcountLine = hcRaw.length > 0 ? hcRaw : "—";
  const hqLine = safeTextTrim(founder.location) || "—";

  const cell = (label: string, value: string) => (
    <div key={label} className="min-w-0 flex-1 basis-[46%] sm:basis-0 sm:min-w-[4.5rem]">
      <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/85">{label}</div>
      <div className="text-[10px] font-medium text-foreground/90 truncate" title={value}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/40 flex-wrap">
      <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2 min-w-0">{cell("Stage", stageLine)}{cell("Sector", sectorLine)}{cell("Type", typeLine)}{cell("Headcount", headcountLine)}{cell("HQ", hqLine)}</div>
      {founder.matchReason ? (
        <Badge className="text-[9px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20 shrink-0">
          <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {founder.matchReason}
        </Badge>
      ) : null}
    </div>
  );
}

function FounderCard({
  founder,
  trending,
  onClick,
  onDeployingClick,
  anchorVcFirmId,
  operatorHubLayout,
  showAdminEdit,
  onAdminEdit,
}: {
  founder: DirectoryEntry;
  trending?: boolean;
  onClick?: () => void;
  onDeployingClick?: () => void;
  anchorVcFirmId?: string | null;
  /** Match investor-search density when browsing Operators scope. */
  operatorHubLayout?: boolean;
  showAdminEdit?: boolean;
  onAdminEdit?: () => void;
}) {
  if (operatorHubLayout && founder.category === "operator") {
    return <OperatorHubCard founder={founder} trending={trending} onClick={onClick} />;
  }

  // Use specialized investor card for investor entries
  if (founder.category === "investor") {
    return (
      <InvestorCard
        founder={founder}
        trending={trending}
        onClick={onClick}
        onDeployingClick={onDeployingClick}
        anchorVcFirmId={anchorVcFirmId}
        showAdminEdit={showAdminEdit}
        onAdminEdit={onAdminEdit}
      />
    );
  }

  const isPersonProfile = founder.category === "founder" && (founder._isRealProfile || founder.category === "founder");
  const { sector: founderCardSector, stage: founderCardStage } = investorSectorStageParts(founder);
  const operatorFooterMid = founder.category === "operator" ? buildOperatorFooterMidDot(founder) : null;

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border-2 border-background shadow-sm text-sm font-bold text-muted-foreground shrink-0 overflow-hidden">
            {founder._logoUrl ? (
              <img
                src={founder._logoUrl}
                alt={founder.name}
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover rounded-xl"
                onError={(e) => {
                  // Fall back to ui-avatars for a styled initials avatar
                  const img = e.currentTarget as HTMLImageElement;
                  const uiUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(founder.name)}&size=40&bold=true&background=random&color=fff&rounded=true`;
                  if (img.src !== uiUrl) { img.src = uiUrl; }
                }}
              />
            ) : founder._isRealProfile ? (
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(founder.name)}&size=40&bold=true&background=random&color=fff&rounded=true`}
                alt={founder.name}
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover rounded-xl"
              />
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
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors">{founder.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground">{founder.model}</span>
            {founder._companyName && (
              <>
                <span className="text-[11px] text-muted-foreground/50 italic">at</span>
                <div className="flex items-center gap-1 text-accent/90">
                  {founder._websiteUrl ? (
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${founder._websiteUrl}&sz=32`} 
                      alt="" 
                      className="h-3 w-3 rounded-sm opacity-90" 
                    />
                  ) : (
                    <Building2 className="h-3 w-3" />
                  )}
                  <span className="text-[11px] font-bold tracking-tight">{founder._companyName}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">{founder.description}</p>
        </div>
        {founder.category === "company" ? (
          <CompanyCardMetricsRow founder={founder} />
        ) : (
          <div className="flex items-center justify-between pt-1 border-t border-border/40 flex-wrap gap-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {founder.location && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-2.5 w-2.5" /> {founder.location}
                </span>
              )}
              {founder.category === "operator" && operatorFooterMid ? (
                <span className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 truncate text-[10px] font-medium text-foreground/80 sm:max-w-[18rem]">
                  {operatorFooterMid}
                </span>
              ) : (founderCardSector || founderCardStage) ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  {founderCardSector ? <span className="font-medium text-foreground/75">{founderCardSector}</span> : null}
                  {founderCardSector && founderCardStage ? <span className="text-muted-foreground/60">·</span> : null}
                  {founderCardStage ? <span>{founderCardStage}</span> : null}
                </span>
              ) : null}
            </div>
            {founder.matchReason && (
              <Badge className="text-[9px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {founder.matchReason}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>);
}

// ── Carousel-ready card wrapper ──
function CarouselCard({
  founder,
  trending,
  onClick,
  onDeployingClick,
  anchorVcFirmId,
  operatorHubLayout,
  showAdminEdit,
  onAdminEdit,
}: {
  founder: DirectoryEntry;
  trending?: boolean;
  onClick?: () => void;
  onDeployingClick?: () => void;
  anchorVcFirmId?: string | null;
  operatorHubLayout?: boolean;
  showAdminEdit?: boolean;
  onAdminEdit?: () => void;
}) {
  return (
    <div className="min-w-[300px] w-80 shrink-0 snap-start">
      <FounderCard
        founder={founder}
        trending={trending}
        onClick={onClick}
        onDeployingClick={onDeployingClick}
        anchorVcFirmId={anchorVcFirmId}
        operatorHubLayout={operatorHubLayout}
        showAdminEdit={showAdminEdit}
        onAdminEdit={onAdminEdit}
      />
    </div>);

}

type CohortTrendStat = { trend: string; trendUp: boolean };

function RotatingCohortTrendText({
  stats,
  initialDelayMs,
  intervalMs = 4800,
  className,
}: {
  stats: readonly CohortTrendStat[];
  initialDelayMs: number;
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (stats.length < 2) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timeoutId = setTimeout(() => {
        setIndex((i) => (i + 1) % stats.length);
        schedule(intervalMs);
      }, delay);
    };
    schedule(initialDelayMs);
    return () => clearTimeout(timeoutId);
  }, [stats, initialDelayMs, intervalMs]);

  const current = stats[index] ?? stats[0];
  if (!current) return null;

  if (stats.length < 2) {
    return (
      <span
        className={cn(
          "text-right text-[10px] font-bold tabular-nums leading-none tracking-tight",
          current.trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          className,
        )}
      >
        {current.trend}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-flex min-h-[12px] min-w-[12.5rem] justify-end align-baseline", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${index}:${current.trend}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "absolute right-0 top-0 whitespace-nowrap text-right text-[10px] font-bold tabular-nums leading-none tracking-tight",
            current.trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          )}
        >
          {current.trend}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function CohortFooterSparkline({
  cohortId,
  values,
  isPrimary,
}: {
  cohortId: string;
  values: readonly number[];
  isPrimary: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-2.5 items-end justify-end gap-px",
        isPrimary ? "opacity-[0.52]" : "opacity-[0.38]",
      )}
      aria-hidden
    >
      {values.map((bar, idx) => (
        <span
          key={`${cohortId}-spark-${idx}`}
          className={cn(
            "animate-cohort-spark-bar w-px shrink-0 rounded-full",
            isPrimary
              ? "bg-muted-foreground/38 dark:bg-white/22"
              : "bg-muted-foreground/28 dark:bg-white/16",
          )}
          style={{
            height: `${Math.max(3, Math.round(bar * 1.35))}px`,
            animationDelay: `${idx * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

const INVESTOR_SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "funding_activity", label: "Funding activity (90d)" },
  { value: "name_az", label: "Name A–Z" },
  { value: "name_za", label: "Name Z–A" },
  { value: "sentiment", label: "Founder sentiment" },
  { value: "deploying", label: "Deploying first" },
] as const;

type InvestorSortValue = (typeof INVESTOR_SORT_OPTIONS)[number]["value"];

function investorMatchPriority(e: DirectoryEntry): number {
  const r = safeTextTrim(e.matchReason).toLowerCase();
  if (r.includes("sector")) return 3;
  if (r.includes("stage")) return 2;
  if (r.length > 0) return 1;
  return 0;
}

/** Stable sort for Network → Investors grid (investor entries only). */
function compareInvestorsForSort(a: DirectoryEntry, b: DirectoryEntry, sort: InvestorSortValue): number {
  const nameA = a.name ?? "";
  const nameB = b.name ?? "";
  switch (sort) {
    case "name_az":
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    case "name_za":
      return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
    case "sentiment": {
      const sa = a._founderSentimentScore;
      const sb = b._founderSentimentScore;
      if (sa == null && sb == null) {
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      }
      if (sa == null) return 1;
      if (sb == null) return -1;
      if (sb !== sa) return sb - sa;
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    }
    case "deploying": {
      const da = a._isActivelyDeploying ? 1 : 0;
      const db = b._isActivelyDeploying ? 1 : 0;
      if (db !== da) return db - da;
      break;
    }
    case "funding_activity": {
      const fa = a._fundingIntelActivity ?? null;
      const fb = b._fundingIntelActivity ?? null;
      if (fa == null && fb == null) {
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      }
      if (fa == null) return 1;
      if (fb == null) return -1;
      if (fb !== fa) return fb - fa;
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    }
    case "recommended":
    default:
      break;
  }
  const mp = investorMatchPriority(b) - investorMatchPriority(a);
  if (mp !== 0) return mp;
  const deploy = Number(!!b._isActivelyDeploying) - Number(!!a._isActivelyDeploying);
  if (deploy !== 0) return deploy;
  const sa = a._founderSentimentScore;
  const sb = b._founderSentimentScore;
  if (sa != null || sb != null) {
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sb !== sa) return sb - sa;
  }
  return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
}

const NETWORK_DIRECTORY_SECTOR_ALL = "__all__";
const NETWORK_DIRECTORY_STAGE_ALL = "__all__";

const NETWORK_DIRECTORY_SORT_OPTIONS = [
  { value: "default", label: "Default order" },
  { value: "name_az", label: "Name A–Z" },
  { value: "name_za", label: "Name Z–A" },
  { value: "headcount_desc", label: "Headcount (high → low)" },
  { value: "headcount_asc", label: "Headcount (low → high)" },
] as const;

type NetworkDirectorySortValue = (typeof NETWORK_DIRECTORY_SORT_OPTIONS)[number]["value"];

function directoryEntryStageFilterKey(entry: DirectoryEntry): string | null {
  if (entry.category === "company") {
    const inst = safeTextTrim(entry._investmentStage);
    if (inst) {
      const shown = displayInvestmentStage(inst);
      if (shown && shown !== "Unknown") return shown;
    }
  }
  const { stage } = investorSectorStageParts(entry);
  const s = safeTextTrim(stage);
  if (s) return s;
  const raw = safeTextTrim(entry.stage);
  if (!raw || raw === "—") return null;
  return formatStageForDisplay(raw);
}

function directoryHeadcountSortKey(entry: DirectoryEntry): number | null {
  if (entry.category !== "company") return null;
  const n = entry._employeeCount;
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

/** Sort / filter pipeline for Network directory (founders / companies / operators — not investor search). */
function compareNetworkDirectoryEntries(
  a: DirectoryEntry,
  b: DirectoryEntry,
  sort: NetworkDirectorySortValue,
): number {
  const nameA = a.name ?? "";
  const nameB = b.name ?? "";
  switch (sort) {
    case "name_az":
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    case "name_za":
      return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
    case "headcount_desc":
    case "headcount_asc": {
      const ka = directoryHeadcountSortKey(a);
      const kb = directoryHeadcountSortKey(b);
      if (ka == null && kb == null) break;
      if (ka == null) return 1;
      if (kb == null) return -1;
      if (ka !== kb) return sort === "headcount_desc" ? kb - ka : ka - kb;
      break;
    }
    case "default":
    default:
      return 0;
  }
  return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
}

function directoryEntryToInvestorPreview(e: DirectoryEntry): InvestorPreviewModel {
  const focus = investorFocusBadgeFromDirectoryFields(e);
  return {
    name: e.name,
    sector: e.sector,
    stage: e.stage,
    description: e.description,
    location: e.location,
    model: e.model,
    matchReason: e.matchReason,
    _logoUrl: e._logoUrl ?? null,
    _websiteUrl: e._websiteUrl ?? null,
    _founderSentimentScore: e._founderSentimentScore ?? null,
    _matchScore: e._matchScore ?? null,
    _isActivelyDeploying: e._isActivelyDeploying,
    _isTrending: e._isTrending,
    _isPopular: e._isPopular,
    _isRecent: e._isRecent,
    _headcount: e._headcount ?? null,
    _aum: e._aum ?? null,
    _firmType: e._firmType,
    _focusPill: focus.pill,
    _focusTooltip: focus.tooltip,
    _aumBand: e._aumBand ?? null,
    _dealVelocityScore: e._dealVelocityScore ?? null,
    _fundingIntelActivity: e._fundingIntelActivity ?? null,
  };
}

function directoryEntryToOperatorPreview(e: DirectoryEntry): InvestorPreviewModel {
  return {
    name: e.name,
    sector: e.sector,
    stage: e.stage,
    description: e.description,
    location: e.location,
    model: e.model,
    matchReason: e.matchReason,
    _logoUrl: e._logoUrl ?? null,
    _websiteUrl: e._websiteUrl ?? null,
    _founderSentimentScore: e._founderSentimentScore ?? null,
    _matchScore: e._matchScore ?? null,
    _isActivelyDeploying: false,
    _isTrending: e._isTrending,
    _isPopular: e._isPopular,
    _isRecent: e._isRecent,
    _headcount: null,
    _aum: null,
    _firmType: "Operator",
    _aumBand: null,
    _dealVelocityScore: null,
  };
}

function directoryEntryToFounderPreview(e: DirectoryEntry): InvestorPreviewModel {
  return {
    name: e.name,
    sector: e.sector,
    stage: e.stage,
    description: e.description,
    location: e.location,
    model: e.model,
    matchReason: e.matchReason,
    _logoUrl: e._logoUrl ?? null,
    _websiteUrl: e._websiteUrl ?? null,
    _founderSentimentScore: e._founderSentimentScore ?? null,
    _matchScore: e._matchScore ?? null,
    _isActivelyDeploying: false,
    _isTrending: e._isTrending,
    _isPopular: e._isPopular,
    _isRecent: e._isRecent,
    _headcount: null,
    _aum: null,
    _firmType: "Founder",
    _aumBand: null,
    _dealVelocityScore: null,
  };
}

function directoryEntryToCompanyPreview(e: DirectoryEntry): InvestorPreviewModel {
  return {
    name: e.name,
    sector: e.sector,
    stage: e.stage,
    description: e.description,
    location: e.location,
    model: e.model,
    matchReason: e.matchReason,
    _logoUrl: e._logoUrl ?? null,
    _websiteUrl: e._websiteUrl ?? null,
    _founderSentimentScore: e._founderSentimentScore ?? null,
    _matchScore: e._matchScore ?? null,
    _isActivelyDeploying: e._isActivelyDeploying === true,
    _isTrending: e._isTrending,
    _isPopular: e._isPopular,
    _isRecent: e._isRecent,
    _headcount: e._headcount ?? null,
    _aum: null,
    _firmType: "Startup",
    _aumBand: null,
    _dealVelocityScore: null,
  };
}

function directoryEntryToNetworkRailPreview(e: DirectoryEntry): InvestorPreviewModel {
  const rk: NonNullable<InvestorPreviewModel["_railRowKind"]> =
    e.category === "investor"
      ? "investor"
      : e.category === "company"
        ? "company"
        : e.category === "founder"
          ? "founder"
          : "operator";
  const base =
    e.category === "company"
      ? directoryEntryToCompanyPreview(e)
      : e.category === "founder"
        ? directoryEntryToFounderPreview(e)
        : e.category === "operator"
          ? directoryEntryToOperatorPreview(e)
          : directoryEntryToInvestorPreview(e);
  return { ...base, _railRowKind: rk };
}

export function CommunityView({
  companyData,
  analysisResult,
  onNavigateProfile,
  variant = "directory",
  investorTab,
  investorListSearchQuery,
  investorScrollTo,
  initialScope,
}: CommunityViewProps) {
  const queryClient = useQueryClient();
  const { isAppAdmin } = useAppAdmin();
  const isInvestorSearch = variant === "investor-search";
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const activeInvestorTab = investorTab ?? "all";
  const [activeScope, setActiveScope] = useState<EntityScope>(
    initialScope ?? (isInvestorSearch ? "investors" : "all"),
  );
  /** When `initialScope` is set from the route (e.g. Network → operators), re-apply if the prop changes; do not fight in-tab scope changes while `initialScope` stays the same. */
  const previousInitialScopeRef = useRef<EntityScope | undefined>(undefined);
  useLayoutEffect(() => {
    if (initialScope === undefined) {
      previousInitialScopeRef.current = undefined;
      return;
    }
    if (previousInitialScopeRef.current === initialScope) return;
    previousInitialScopeRef.current = initialScope;
    setActiveScope(initialScope);
  }, [initialScope]);
  const [visibleCount, setVisibleCount] = useState(() =>
    variant === "investor-search" ? INVESTOR_DIRECTORY_INITIAL_VISIBLE : PAGE_SIZE,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<DirectoryEntry | null>(null);
  const [selectedInvestor, setSelectedInvestor] = useState<DirectoryEntry | null>(null);
  const [selectedVCFirm, setSelectedVCFirm] = useState<VCFirm | null>(null);
  const [selectedVCPerson, setSelectedVCPerson] = useState<VCPerson | null>(null);
  const [selectedVCPersonFirm, setSelectedVCPersonFirm] = useState<VCFirm | null>(null);
  const [adminEditRecord, setAdminEditRecord] = useState<AdminEditableRecord | null>(null);
  const [investorInitialTab, setInvestorInitialTab] = useState<"Updates" | "Activity">("Updates");
  const [userStatuses, setUserStatuses] = useState<string[]>(["PARTNERSHIPS"]);
  const [activeCohortId, setActiveCohortId] = useState<string | null>(null);
  const [investorSort, setInvestorSort] = useState<InvestorSortValue>(() =>
    variant === "investor-search" ? "name_az" : "recommended",
  );
  const [networkDirectorySort, setNetworkDirectorySort] = useState<NetworkDirectorySortValue>("default");
  const [networkDirectorySector, setNetworkDirectorySector] = useState<string>(NETWORK_DIRECTORY_SECTOR_ALL);
  const [networkDirectoryStage, setNetworkDirectoryStage] = useState<string>(NETWORK_DIRECTORY_STAGE_ALL);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInvestorSearch) setActiveScope("investors");
  }, [isInvestorSearch]);

  const toggleStatus = (status: string) => {
    setUserStatuses(prev => 
      prev.includes(status) 
        ? (prev.length > 1 ? prev.filter(s => s !== status) : prev) 
        : [...prev, status]
    );
  };

  // VC Directory: 2,805 firms + 5,247 people from JSON
  const {
    firms: vcFirms, people: vcPeople, loading: vcLoading, error: vcDirectoryError,
    firmMap, getFirmById, getPartnersForFirm: getVCPartners, getFirmForPerson,
  } = useVCDirectory();

  const communityGrid = useCommunityGridData({
    isInvestorSearch,
    activeScope,
    activeFilter,
  });

  const realFounders = communityGrid.founders;
  const realCompanies = communityGrid.companies;
  const realOperators = communityGrid.operators;

  // DB-backed investor data for enrichment (firm_type, deploying status, sentiment, headcount)
  const { data: dbInvestors } = useInvestorDirectory();
  const { data: liveInvestorPeople } = useInvestorPeopleDirectory();

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
      if (!firm?.name?.trim()) continue;
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

  const liveInvestorPersonEntries = useMemo<DirectoryEntry[]>(() => {
    return (liveInvestorPeople ?? []).map((person) => {
      const firmName = person.firm?.firm_name ?? "Unknown Firm";
      const vcFirmMatch = getVCFirmMatch(firmName);
      const stageFocus = person.stage_focus.length > 0 ? person.stage_focus : person.firm?.stage_focus ?? [];
      const sectorFocus = person.sector_focus.length > 0 ? person.sector_focus : person.firm?.thesis_verticals ?? [];
      const location = [person.city, person.state, person.country].filter(Boolean).join(", ") || person.firm?.location || "";
      const title = safeTextTrim(person.title) || "Investor";
      const personFirm: VCFirm = {
        id: vcFirmMatch?.id ?? person.firm_id,
        name: firmName,
        x_url: null,
        description: person.firm?.thesis_verticals?.join(", ") || null,
        aum: person.firm?.aum ?? null,
        aum_band: null,
        sweet_spot: person.sweet_spot ?? null,
        stages: stageFocus,
        sectors: sectorFocus,
        logo_url: person.firm?.logo_url ?? null,
        website_url: person.firm?.website_url ?? null,
        aliases: null,
      };
      const personData: VCPerson = {
        id: person.id,
        full_name: person.full_name,
        first_name: person.first_name,
        last_name: person.last_name,
        title: person.title,
        firm_id: person.firm_id,
        primary_firm_name: firmName,
        is_active: person.is_active,
        avatar_url: person.avatar_url,
        profile_image_url: person.avatar_url,
        email: person.email,
        linkedin_url: person.linkedin_url,
        x_url: person.x_url,
        website_url: person.website_url,
        bio: person.bio,
        city: person.city,
        state: person.state,
        country: person.country,
        stage_focus: person.stage_focus,
        sector_focus: person.sector_focus,
        personal_thesis_tags: person.personal_thesis_tags,
        check_size: {
          min_usd: person.check_size_min,
          max_usd: person.check_size_max,
          average_usd: null,
        },
      } as VCPerson;

      return {
        name: person.full_name,
        sector: sectorFocus.slice(0, 2).join(", ") || "Generalist",
        stage: collapseStagesToRange(stageFocus) || stageFocus.slice(0, 2).join(", ") || "Multi-stage",
        description: person.bio || `${title} at ${firmName}`,
        location,
        model: title,
        initial: person.full_name.charAt(0).toUpperCase(),
        matchReason: null,
        category: "investor" as const,
        _sectors: sectorFocus,
        _stages: stageFocus,
        _firmType:
          person.firm?.firm_type ??
          resolveDirectoryFirmTypeKey(firmName, null, person.firm?.entity_type ?? null),
        _strategyClassifications: person.firm?.strategy_classifications ?? null,
        _thesisOrientation: person.firm?.thesis_orientation ?? null,
        _sectorScope: person.firm?.sector_scope ?? null,
        _thesisVerticals: person.firm?.thesis_verticals?.length
          ? person.firm.thesis_verticals
          : sectorFocus,
        _geoFocus: person.firm?.geo_focus ?? null,
        _seedSectors: null,
        _isActivelyDeploying: person.firm?.is_actively_deploying === true,
        _founderSentimentScore: person.firm?.founder_reputation_score ?? null,
        _headcount: person.firm?.headcount ?? null,
        _aum: person.firm?.aum ?? null,
        _aumBand: investorAumBandLabel(person.firm?.aum ?? null),
        _logoUrl:
          investorPrimaryAvatarUrl({
            avatar_url: person.avatar_url,
            profile_image_url: person.profile_image_url,
          }) || person.firm?.logo_url || null,
        _isTrending: isInvestorTrendingMerged(person.firm?.is_trending, false, firmName),
        _isPopular: person.firm?.is_popular ?? false,
        _isRecent: person.firm?.is_recent ?? false,
        _firmId: person.firm_id,
        _vcFirmId: vcFirmMatch?.id ?? null,
        _websiteUrl: person.website_url || person.firm?.website_url || null,
        _dealVelocityScore: computeDealVelocityScore(
          person.firm?.recent_deals ?? null,
          person.firm?.is_actively_deploying ?? null,
        ),
        _fundingIntelActivity:
          person.funding_intel_activity_score ?? person.firm?.funding_intel_activity_score ?? null,
        _investorEntityType: "person",
        _investorFirmName: firmName,
        _personData: personData,
        _personFirm: vcFirmMatch ?? personFirm,
      };
    });
  }, [liveInvestorPeople, getVCFirmMatch]);

  const investorAnchorVcFirmId = useCallback(
    (e: DirectoryEntry) =>
      e.category === "investor" ? e._vcFirmId ?? getVCFirmMatch(e.name)?.id ?? e._firmId ?? null : null,
    [getVCFirmMatch],
  );

  // Merge VC JSON firms into the directory entries for grid display
  // Store the original VCFirm ref so we can do exact sector matching later
  const vcEntries = useMemo(() => {
    const seedNames = new Set<string>();
    /** When mock investor cards are omitted, keep every MDM firm — otherwise a name collision hides the real row. */
    const investorMocksShown = !isInvestorSearch && activeScope !== "investors";
    return vcFirms
      .filter((f) => typeof f.name === "string" && f.name.trim().length > 0)
      .filter((f) => !investorMocksShown || !seedNames.has(f.name.toLowerCase()))
      .map((f) => {
        const displayName = f.name.trim();
        const dbMatch = getDbMatch(displayName);
        const fallbackWebsite = f.website_url || deriveWebsiteUrlFromFirmId(f.id);
        const resolvedAum = f.aum || (dbMatch as any)?.aum || null;

        return {
          name: displayName,
          sector: f.sectors?.filter(Boolean).slice(0, 2).join(", ") || "Generalist",
          stage: collapseStagesToRange(f.stages?.filter(Boolean) ?? []) || "Multi-stage",
          description: (dbMatch as any)?.description || (dbMatch as any)?.elevator_pitch || f.description || `${displayName} is an active investment firm.`,
          location: (dbMatch as any)?.hq_city ? [(dbMatch as any).hq_city, (dbMatch as any).hq_state].filter(Boolean).join(", ") : (dbMatch?.location || ""),
          model: f.sweet_spot || f.aum || "",
          initial: displayName.charAt(0).toUpperCase(),
          matchReason: null,
          category: "investor" as const,
          _sectors: f.sectors || [] as string[],
          _stages: f.stages || [] as string[],
          _firmType: (dbMatch as any)?.firm_type ?? resolveDirectoryFirmTypeKey(displayName, null),
          _strategyClassifications: (dbMatch as any)?.strategy_classifications ?? null,
          _thesisOrientation: (dbMatch as any)?.thesis_orientation ?? null,
          _sectorScope: (dbMatch as any)?.sector_scope ?? null,
          _thesisVerticals: (dbMatch as any)?.thesis_verticals ?? [],
          _geoFocus: (dbMatch as any)?.geo_focus ?? null,
          _seedSectors: dbMatch ? null : (f.sectors || []).filter(Boolean),
          _isActivelyDeploying: (dbMatch as any)?.is_actively_deploying === true,
          _founderSentimentScore: (dbMatch as any)?.founder_reputation_score ?? null,
          _headcount: (dbMatch as any)?.headcount ?? null,
          _aum: resolvedAum,
          _aumBand: investorAumBandLabel(resolvedAum),
          _logoUrl: (dbMatch as any)?.logo_url || f.logo_url || null,
          _isTrending: isInvestorTrendingMerged(
            (dbMatch as any)?.is_trending,
            false,
            displayName,
          ),
          _isPopular: (dbMatch as any)?.is_popular ?? false,
          _isRecent: (dbMatch as any)?.is_recent ?? false,
          _firmId: (dbMatch as any)?.id || f.id || null,
          _websiteUrl: (dbMatch as any)?.website_url || fallbackWebsite || null,
          _dealVelocityScore: computeDealVelocityScore(
            (dbMatch as any)?.recent_deals ?? null,
            (dbMatch as any)?.is_actively_deploying ?? null,
          ),
          _fundingIntelActivity: dbMatch?.funding_intel_activity_score ?? null,
        };
      });
  }, [vcFirms, getDbMatch, isInvestorSearch, activeScope]);

  /** Firms that exist in live `firm_records` but not in MDM JSON / `vc_firms` — otherwise they are unsearchable. */
  const dbOnlyFirmEntries: DirectoryEntry[] = useMemo(() => {
    if (!dbInvestors?.length) return [];
    const vcNameKeys = new Set(vcFirms.map((f) => normalizeFirmName(f.name)));
    const out: DirectoryEntry[] = [];
    const seenIds = new Set<string>();
    for (const inv of dbInvestors) {
      if (!inv.id || seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);
      const nk = normalizeFirmName(inv.name);
      if (!nk || vcNameKeys.has(nk)) continue;
      out.push({
        name: inv.name,
        sector: inv.sector || "Generalist",
        stage: inv.stage || "Multi-stage",
        description: inv.description,
        location: inv.location || "",
        model: inv.model || "",
        initial: inv.initial,
        matchReason: null,
        category: "investor" as const,
        _sectors: [] as string[],
        _stages: [] as string[],
        _firmType: inv.firm_type ?? resolveDirectoryFirmTypeKey(inv.name, null),
        _strategyClassifications: inv.strategy_classifications ?? null,
        _thesisOrientation: inv.thesis_orientation ?? null,
        _sectorScope: inv.sector_scope ?? null,
        _thesisVerticals: inv.thesis_verticals ?? [],
        _geoFocus: inv.geo_focus ?? null,
        _seedSectors: null,
        _isActivelyDeploying: inv.is_actively_deploying === true,
        _founderSentimentScore: inv.founder_reputation_score ?? null,
        _headcount: inv.headcount ?? null,
        _aum: inv.aum ?? null,
        _aumBand: investorAumBandLabel(inv.aum ?? null),
        _logoUrl: inv.logo_url ?? null,
        _isTrending: inv.is_trending ?? false,
        _isPopular: inv.is_popular ?? false,
        _isRecent: inv.is_recent ?? false,
        _firmId: inv.id,
        _websiteUrl: inv.website_url ?? null,
        _dealVelocityScore: computeDealVelocityScore(
          inv.recent_deals ?? null,
          inv.is_actively_deploying ?? null,
        ),
        _fundingIntelActivity: inv.funding_intel_activity_score ?? null,
      });
    }
    return out;
  }, [dbInvestors, vcFirms]);

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
      _logoUrl: f.avatar_url || null,
      _websiteUrl: f.company_website ?? null,
      _linkedinUrl: f.linkedin_url ?? null,
      _twitterUrl: f.twitter_url ?? null,
      competitors: f.company_competitors || [],
    }));
  }, [realFounders]);

  // Convert real company profiles to DirectoryEntry format
  const realCompanyEntries: DirectoryEntry[] = useMemo(() => {
    return realCompanies
      .filter((c) => c.name)
      .map((c) => {
        const yc = c.yc_batch && String(c.yc_batch).trim() ? String(c.yc_batch).trim() : "";
        const inv = c.investment_stage && String(c.investment_stage).trim() ? String(c.investment_stage).trim() : "";
        const cohortStages = !inv && yc.length > 0 ? [`YC ${yc}`] : ([] as string[]);
        const ec = c.employee_count;
        const employeeCount =
          ec != null && Number.isFinite(Number(ec)) ? Math.round(Number(ec)) : null;
        return {
          name: c.name,
          sector: c.sector || "—",
          stage: "—",
          description: c.description || `${c.name} is a startup company.`,
          location: [c.city, c.country].filter(Boolean).join(", "),
          model: c.is_yc_backed ? "YC-backed" : "Startup",
          initial: c.name.charAt(0).toUpperCase(),
          matchReason: null,
          category: "company" as const,
          _sectors: [] as string[],
          _stages: cohortStages,
          _isRealProfile: true,
          _websiteUrl: c.website || null,
          _logoUrl: c.logo_url || null,
          _firmId: c.id,
          _headcount: formatCompanyHeadcountDisplay(c.employee_count),
          _employeeCount: employeeCount,
          _fundingStatus: c.funding_status ?? null,
          _vcBacked: c.vc_backed ?? null,
          _investmentStage: c.investment_stage ?? null,
        };
      });
  }, [realCompanies]);

  // Convert real operator profiles to DirectoryEntry format
  const realOperatorEntries: DirectoryEntry[] = useMemo(() => {
    return realOperators.map((op) => {
      const sectorList = Array.isArray(op.sector_focus)
        ? op.sector_focus.map((s) => String(s)).map((s) => s.trim()).filter(Boolean)
        : [];
      const primarySector = operatorPrimarySectorFromProfile(sectorList);
      const functionLabel = inferOperatorFunctionLabel(op.title, op.expertise);
      const roleTitle = safeTextTrim(op.title);
      const expertiseList = Array.isArray(op.expertise)
        ? op.expertise.map((e) => String(e).trim()).filter(Boolean)
        : [];
      const priorList = Array.isArray(op.prior_companies)
        ? op.prior_companies.map((p) => String(p).trim()).filter(Boolean)
        : [];
      const currentCo = safeTextTrim(op.current_company_name);
      const displayCompany = currentCo || operatorPriorCompanyName(op.prior_companies);
      return {
        name: op.full_name,
        sector: sectorList.slice(0, 2).join(", ") || "—",
        stage: op.stage_focus || "—",
        description: op.bio || (op.title ? `${op.title} — available for operator engagements.` : "Experienced operator."),
        location: [op.city, op.state, op.country].filter(Boolean).join(", "),
        /** Job title — shown under name like founders’ role (not engagement mode). */
        model: roleTitle || "Operator",
        initial: op.full_name.charAt(0).toUpperCase(),
        matchReason: null,
        category: "operator" as const,
        _sectors: sectorList.length > 0 ? sectorList : ([] as string[]),
        _stages: [] as string[],
        _isRealProfile: true,
        _profileId: op.id,
        _websiteUrl: null,
        _linkedinUrl: op.linkedin_url ?? null,
        _twitterUrl: op.x_url ?? null,
        _logoUrl: op.avatar_url || null,
        _companyName: displayCompany || null,
        _operatorPrimarySector: primarySector,
        _operatorFunctionLabel: functionLabel,
        _operatorExpertise: expertiseList.length > 0 ? expertiseList : null,
        _operatorPriorCompanies: priorList.length > 0 ? priorList : null,
        _operatorCurrentCompany: currentCo || null,
      };
    });
  }, [realOperators]);

  const mergedEntries = useMemo(() => {
    return [
      ...realFounderEntries,
      ...realCompanyEntries,
      ...realOperatorEntries,
      ...dbOnlyFirmEntries,
      ...vcEntries,
    ];
  }, [vcEntries, dbOnlyFirmEntries, realFounderEntries, realCompanyEntries, realOperatorEntries]);

  const isOperatorHubLayout = !isInvestorSearch && activeScope === "operators";

  const investorDirectoryUnavailable =
    (isInvestorSearch || activeScope === "investors") && !vcLoading && vcFirms.length === 0;

  const hasProfile = !!companyData?.name;

  type CohortCluster = "location" | "stage" | "connections" | "professionals";

  // ── Smart Cohort data ──
  const cohorts = useMemo(() => {
    const userLocation = String(companyData?.hqLocation ?? "San Francisco, CA");
    const userCity = userLocation.split(",")[0]?.trim() ?? "";
    const userStage = safeTextTrim(companyData?.stage) || "Seed";

    if (isOperatorHubLayout) {
      const op = mergedEntries.filter((e) => e.category === "operator");
      const matchCount = op.filter((e) => e.matchReason).length;
      const localCount = op.filter((e) => safeTextTrim(e.location).includes(userCity)).length;
      const stageNorm = userStage.toLowerCase();
      const stageCount = op.filter((e) => safeTextTrim(e.stage).toLowerCase().includes(stageNorm)).length;
      const benchCount = op.length;
      return [
        {
          id: "matches",
          value: matchCount || 3,
          label: "Strong fits",
          icon: TrendingUp,
          filterKey: "",
          timeframe: "this week",
          trendStats: [
            { trend: "▲ 14% vs last week", trendUp: true },
            { trend: "88% intro acceptance on warm paths", trendUp: true },
          ],
          sparkline: [3, 4, 5, 4, 6, 7],
          cluster: "professionals" as CohortCluster,
          isPrimary: false,
        },
        {
          id: "local",
          value: localCount || 5,
          label: `Operators in ${userCity}`,
          icon: MapPin,
          filterKey: userCity,
          timeframe: "last 30 days",
          trendStats: [
            { trend: "▲ 5% vs prior month", trendUp: true },
            { trend: "Net +7% in your metro", trendUp: true },
          ],
          sparkline: [2, 3, 3, 4, 4, 5],
          cluster: "location" as CohortCluster,
          isPrimary: false,
        },
        {
          id: "stage",
          value: stageCount || 4,
          label: `${userStage} stage bench`,
          icon: Zap,
          filterKey: userStage,
          timeframe: "last 30 days",
          trendStats: [
            { trend: "▲ 10% vs prior period", trendUp: true },
            { trend: "Avg 2.1 shared portfolio cos.", trendUp: true },
          ],
          sparkline: [2, 3, 4, 3, 4, 5],
          cluster: "stage" as CohortCluster,
          isPrimary: false,
        },
        {
          id: "bench-depth",
          value: benchCount || 6,
          label: "Bench depth",
          icon: Users,
          filterKey: "",
          timeframe: "this week",
          trendStats: [
            { trend: "▼ 2% vs last week", trendUp: false },
            { trend: "▲ 6% vs 30-day average", trendUp: true },
          ],
          sparkline: [5, 5, 4, 4, 4, 3],
          cluster: "connections" as CohortCluster,
          isPrimary: false,
        },
      ] as const;
    }

    const pool = mergedEntries.filter((e) => e.category !== "investor");
    const userSectorNorm = safeTextTrim(companyData?.sector).toLowerCase();
    const localCount = pool.filter((e) => safeTextTrim(e.location).toLowerCase().includes(userCity.toLowerCase())).length;
    const stageCount = pool.filter((e) => safeTextTrim(e.stage).toLowerCase().includes(userStage.toLowerCase())).length;
    const founderCount = pool.filter((e) => e.category === "founder").length;
    const matchCount = pool.filter(
      (e) =>
        e.matchReason ||
        (userSectorNorm.length > 0 && safeTextTrim(e.sector).toLowerCase().includes(userSectorNorm)),
    ).length;

    return [
      {
        id: "matches",
        value: matchCount || 5,
        label: "In your network",
        icon: TrendingUp,
        filterKey: "",
        timeframe: "this week",
        trendStats: [
          { trend: "▲ 18% vs last week", trendUp: true },
          { trend: "92% reply rate on warm intros", trendUp: true },
        ],
        sparkline: [3, 4, 5, 4, 6, 7],
        cluster: "professionals" as CohortCluster,
        isPrimary: false,
      },
      {
        id: "local",
        value: localCount || 12,
        label: `In ${userCity}`,
        icon: MapPin,
        filterKey: userCity,
        timeframe: "last 30 days",
        trendStats: [
          { trend: "▲ 6% vs previous month", trendUp: true },
          { trend: "Net +9% in your micro-market", trendUp: true },
        ],
        sparkline: [2, 3, 3, 4, 4, 5],
        cluster: "location" as CohortCluster,
        isPrimary: false,
      },
      {
        id: "stage",
        value: stageCount || 8,
        label: `${userStage} Stage Peers`,
        icon: Zap,
        filterKey: userStage,
        timeframe: "last 30 days",
        trendStats: [
          { trend: "▲ 12% vs prior period", trendUp: true },
          { trend: "Avg 2.4 mutual connections", trendUp: true },
        ],
        sparkline: [2, 3, 4, 3, 4, 5],
        cluster: "stage" as CohortCluster,
        isPrimary: false,
      },
      {
        id: "founders",
        value: founderCount,
        label: "Recommended",
        icon: Users,
        filterKey: "",
        timeframe: "this week",
        trendStats: [
          { trend: "▼ 3% vs last week", trendUp: false },
          { trend: "▲ 5% vs 30-day average", trendUp: true },
        ],
        sparkline: [5, 5, 4, 4, 4, 3],
        cluster: "connections" as CohortCluster,
        isPrimary: false,
      },
    ] as const;
  }, [companyData, mergedEntries, isOperatorHubLayout, companyData?.sector]);

  // Cohort detail entries — filtered list shown inside the detail drawer
  const cohortDetailEntries = useMemo(() => {
    if (!activeCohortId) return [];
    const userLocation = String(companyData?.hqLocation ?? "San Francisco, CA");
    const userCity = userLocation.split(",")[0]?.trim() ?? "";
    const userStage = safeTextTrim(companyData?.stage) || "Seed";
    const base = isOperatorHubLayout
      ? mergedEntries.filter((e) => e.category === "operator")
      : mergedEntries;
    switch (activeCohortId) {
      case "matches":
        return base.filter((e) => e.matchReason);
      case "local":
        return base.filter((e) => safeTextTrim(e.location).includes(userCity));
      case "stage":
        return base.filter((e) => {
          if (isOperatorHubLayout) {
            return safeTextTrim(e.stage).toLowerCase().includes(userStage.toLowerCase());
          }
          return safeTextTrim(e.stage) === userStage;
        });
      case "bench-depth":
        return isOperatorHubLayout ? base : [];
      case "founders":
        return mergedEntries.filter((e) => e.category === "founder");
      default:
        return [];
    }
  }, [activeCohortId, mergedEntries, companyData, isOperatorHubLayout]);

  // Cohort click handler — filter results
  const handleCohortClick = useCallback(
    (filterKey: string, scopeOverride?: EntityScope) => {
      if (filterKey) {
        setActiveFilter(filterKey);
      }
      if (scopeOverride) {
        setActiveScope(scopeOverride);
        return;
      }

      if (!filterKey) {
        if (isInvestorSearch) setActiveScope("investors");
        else if (activeScope === "operators") setActiveScope("operators");
      }
    },
    [isInvestorSearch, activeScope],
  );

  // Reset pagination on filter/scope/sort change (not on text search — large indices must stay reachable for scroll-to-pick)
  useEffect(() => {
    setVisibleCount(isInvestorSearch ? INVESTOR_DIRECTORY_INITIAL_VISIBLE : PAGE_SIZE);
  }, [activeFilter, activeScope, activeInvestorTab, investorSort, isInvestorSearch]);

  /** Run before paint so directory filters never carry across All / Companies / Founders / Operators. */
  useLayoutEffect(() => {
    setNetworkDirectorySector(NETWORK_DIRECTORY_SECTOR_ALL);
    setNetworkDirectoryStage(NETWORK_DIRECTORY_STAGE_ALL);
    setNetworkDirectorySort("default");
    setActiveCohortId(null);
  }, [activeScope]);

  /** Founders / companies / operators come from `useCommunityGridData` (SQL filters) — skip duplicate chip pass. */
  const directoryDbGrid = !isInvestorSearch && activeScope !== "investors";

  const scopedAll = filterByScope(mergedEntries, activeScope).filter(
    (e) => e.category !== "investor" || isInvestorSearch || activeScope === "investors",
  );

  const filteredAll = useMemo(() => {
    if (directoryDbGrid) return scopedAll;
    return scopedAll.filter((f) => {
      const filterQ = safeTextTrim(activeFilter).toLowerCase();
      if (!filterQ) return true;
      const stage = (f.stage ?? "").toString().toLowerCase();
      const sector = (f.sector ?? "").toString().toLowerCase();
      const model = (f.model ?? "").toString().toLowerCase();
      return stage.includes(filterQ) || sector.includes(filterQ) || model.includes(filterQ);
    });
  }, [directoryDbGrid, scopedAll, activeFilter]);

  // ── Investor tab filtering & sorting ──
  // Company profile JSON can store stage/sector as numbers — never call string methods on raw values.
  const userStage = safeTextTrim(companyData?.stage);
  const userSector = safeTextTrim(companyData?.sector);

  const investorTabFiltered = useMemo(() => {
    if (!isInvestorSearch) return filteredAll;

    // Only investors for investor-search tabs
    const investors = filteredAll.filter((e) => e.category === "investor");

    switch (activeInvestorTab) {
      case "matches": {
        return investors.filter((e) => e.matchReason || e._isActivelyDeploying === true);
      }
      case "stage": {
        if (!userStage) return investors;
        return investors.filter((e) => {
          // Exact match against structured _stages array when available
          if (Array.isArray(e._stages) && e._stages.length > 0) {
            return e._stages.some((s) => safeTextTrim(s) === userStage);
          }
          // Fallback for mock entries
          const stageNorm = userStage.toLowerCase();
          const entryStage = (e.stage ?? "").toString().toLowerCase();
          return (
            entryStage.includes(stageNorm) ||
            entryStage.split("–").some((s) => s.trim().toLowerCase().includes(stageNorm))
          );
        });
      }
      case "sector": {
        if (!userSector) return investors;
        // Collect all user sectors (primary + secondary from subsectors)
        const userSectors = [userSector];
        const subs = companyData?.subsectors;
        if (Array.isArray(subs)) {
          for (const s of subs) {
            const t = safeTextTrim(s);
            if (t) userSectors.push(t);
          }
        }
        return investors.filter((e) => {
          // Exact match against structured _sectors array when available
          if (Array.isArray(e._sectors) && e._sectors.length > 0) {
            return e._sectors.some((s) => userSectors.includes(safeTextTrim(s)));
          }
          // Fallback for mock entries
          const sectorNorm = userSector.toLowerCase();
          const entrySector = (e.sector ?? "").toString().toLowerCase();
          const entryDesc = (e.description ?? "").toString().toLowerCase();
          return entrySector.includes(sectorNorm) || entryDesc.includes(sectorNorm);
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
  const investorSearchQueryTrim = safeTextTrim(investorListSearchQuery ?? "");

  /** Firms from `search_firm_records` when the grid query is non-trivial — surfaces names missed by MDM merge / pagination. */
  const investorDirectoryRpcFirms = useQuery({
    queryKey: ["community-investor-directory-firm-rpc", investorSearchQueryTrim],
    queryFn: async () => {
      const rows = await rpcSearchFirmRecords(investorSearchQueryTrim, 60, true, supabaseVcDirectory);
      return rows.map((row) => mapDbInvestor(row));
    },
    enabled: isInvestorSearch && investorSearchQueryTrim.length >= 2 && isSupabaseConfigured,
    staleTime: 45_000,
  });

  const displayEntriesWithRpcFirms = useMemo(() => {
    if (!isInvestorSearch || investorSearchQueryTrim.length < 2) return displayEntries;
    const seenFirmId = new Set<string>();
    const seenFirmNameKey = new Set<string>();
    for (const e of displayEntries) {
      if (e.category !== "investor") continue;
      if (e._firmId && isUuid(e._firmId)) seenFirmId.add(String(e._firmId));
      if (e._investorEntityType !== "person") {
        const nk = normalizeFirmName(e.name);
        if (nk) seenFirmNameKey.add(nk);
      } else if (e._investorFirmName) {
        const nk = normalizeFirmName(e._investorFirmName);
        if (nk) seenFirmNameKey.add(nk);
      }
    }
    const extra: DirectoryEntry[] = [];
    const tryAddInvestor = (inv: LiveInvestorEntry) => {
      if (!inv.id) return;
      if (seenFirmId.has(inv.id)) return;
      const nk = normalizeFirmName(inv.name);
      if (nk && seenFirmNameKey.has(nk)) return;
      if (nk) seenFirmNameKey.add(nk);
      seenFirmId.add(inv.id);
      extra.push(directoryEntryFromLiveInvestor(inv));
    };

    const rpcHits = investorDirectoryRpcFirms.data;
    if (rpcHits?.length) {
      for (const inv of rpcHits) tryAddInvestor(inv);
    }

    const q = investorSearchQueryTrim;
    if (dbInvestors?.length) {
      for (const inv of dbInvestors) {
        if (!firmDisplayNameMatchesQuery(inv.name, q)) continue;
        tryAddInvestor(inv);
      }
    }

    return extra.length > 0 ? [...extra, ...displayEntries] : displayEntries;
  }, [
    displayEntries,
    isInvestorSearch,
    investorSearchQueryTrim,
    investorDirectoryRpcFirms.data,
    dbInvestors,
  ]);

  const textFilteredEntries = useMemo(() => {
    const qRaw = safeTextTrim(investorListSearchQuery);
    const q = qRaw.toLowerCase();
    if (!isInvestorSearch || !q) return displayEntriesWithRpcFirms;
    return displayEntriesWithRpcFirms.filter((e) => {
      const nameMatch =
        e.category === "investor" && e._investorEntityType === "person"
          ? personDisplayNameMatchesQuery((e.name ?? "").toString(), qRaw)
          : firmDisplayNameMatchesQuery((e.name ?? "").toString(), qRaw);
      const sector = (e.sector ?? "").toString().toLowerCase();
      const stage = (e.stage ?? "").toString().toLowerCase();
      const desc = (e.description ?? "").toString().toLowerCase();
      const model = (e.model ?? "").toString().toLowerCase();
      return (
        nameMatch ||
        sector.includes(q) ||
        stage.includes(q) ||
        desc.includes(q) ||
        model.includes(q)
      );
    });
  }, [displayEntriesWithRpcFirms, investorListSearchQuery, isInvestorSearch]);

  const networkDirectoryFilterSource = useMemo(() => {
    if (isInvestorSearch) return [];
    return textFilteredEntries;
  }, [isInvestorSearch, textFilteredEntries]);

  const networkSectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of networkDirectoryFilterSource) {
      const s = safeTextTrim(e.sector);
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [networkDirectoryFilterSource]);

  const networkStageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of networkDirectoryFilterSource) {
      const k = directoryEntryStageFilterKey(e);
      if (k) set.add(k);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [networkDirectoryFilterSource]);

  useEffect(() => {
    if (
      networkDirectorySector !== NETWORK_DIRECTORY_SECTOR_ALL &&
      !networkSectorOptions.includes(networkDirectorySector)
    ) {
      setNetworkDirectorySector(NETWORK_DIRECTORY_SECTOR_ALL);
    }
  }, [networkDirectorySector, networkSectorOptions]);

  useEffect(() => {
    if (
      networkDirectoryStage !== NETWORK_DIRECTORY_STAGE_ALL &&
      !networkStageOptions.includes(networkDirectoryStage)
    ) {
      setNetworkDirectoryStage(NETWORK_DIRECTORY_STAGE_ALL);
    }
  }, [networkDirectoryStage, networkStageOptions]);

  const networkDirectorySortOptionsForUi = useMemo(
    () =>
      isOperatorHubLayout
        ? NETWORK_DIRECTORY_SORT_OPTIONS.filter((o) => !String(o.value).startsWith("headcount"))
        : [...NETWORK_DIRECTORY_SORT_OPTIONS],
    [isOperatorHubLayout],
  );

  const effectiveNetworkDirectorySort = useMemo((): NetworkDirectorySortValue => {
    return networkDirectorySortOptionsForUi.some((o) => o.value === networkDirectorySort)
      ? networkDirectorySort
      : "default";
  }, [networkDirectorySort, networkDirectorySortOptionsForUi]);

  const networkDirectoryGridEntries = useMemo(() => {
    if (!directoryDbGrid) return textFilteredEntries;
    let list = [...textFilteredEntries];
    if (networkDirectorySector !== NETWORK_DIRECTORY_SECTOR_ALL) {
      list = list.filter((e) => safeTextTrim(e.sector) === networkDirectorySector);
    }
    if (networkDirectoryStage !== NETWORK_DIRECTORY_STAGE_ALL) {
      list = list.filter((e) => directoryEntryStageFilterKey(e) === networkDirectoryStage);
    }
    if (effectiveNetworkDirectorySort !== "default") {
      list.sort((a, b) => compareNetworkDirectoryEntries(a, b, effectiveNetworkDirectorySort));
    }
    return list;
  }, [
    directoryDbGrid,
    textFilteredEntries,
    networkDirectorySector,
    networkDirectoryStage,
    effectiveNetworkDirectorySort,
  ]);

  const gridEntries = useMemo(() => {
    if (directoryDbGrid) {
      return networkDirectoryGridEntries;
    }
    const list = [...textFilteredEntries];
    if (isInvestorSearch || isOperatorHubLayout) {
      list.sort((a, b) => compareInvestorsForSort(a, b, investorSort));
    }
    return list;
  }, [
    directoryDbGrid,
    networkDirectoryGridEntries,
    textFilteredEntries,
    investorSort,
    isInvestorSearch,
    isOperatorHubLayout,
  ]);

  const hasMore = directoryDbGrid ? communityGrid.hasMore : visibleCount < gridEntries.length;
  const visibleGrid = useMemo(() => {
    if (directoryDbGrid) return gridEntries;
    return gridEntries.slice(0, visibleCount);
  }, [directoryDbGrid, gridEntries, visibleCount]);

  useEffect(() => {
    const logNetwork =
      import.meta.env.DEV ||
      (typeof import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "string" &&
        import.meta.env.VITE_LOG_NETWORK_DIRECTORY === "1");
    if (!logNetwork || isInvestorSearch || activeScope !== "operators") return;

    const scoped = filterByScope(mergedEntries, "operators");
    const badCategory = realOperatorEntries.find((e) => e.category !== "operator");
    if (badCategory) {
      console.warn("[CommunityView] operator map missing category operator", badCategory.name);
    }

    console.info("[CommunityView] operator-only trace", {
      supabaseHookOperators: communityGrid.operators.length,
      mappedDirectoryEntries: realOperatorEntries.length,
      afterFilterByScope: scoped.length,
      renderedOperatorCards: visibleGrid.filter((e) => e.category === "operator").length,
      visibleGridLength: visibleGrid.length,
      gridEntriesLength: gridEntries.length,
    });
  }, [
    activeScope,
    isInvestorSearch,
    communityGrid.operators.length,
    realOperatorEntries,
    mergedEntries,
    visibleGrid,
    gridEntries.length,
  ]);

  const gridLoadingMore = directoryDbGrid ? communityGrid.loadingMore : isLoadingMore;

  useLayoutEffect(() => {
    if (!isInvestorSearch || !investorScrollTo?.vcFirmId) return;
    const { vcFirmId } = investorScrollTo;

    const idx = gridEntries.findIndex((e) => {
      if (e.category !== "investor") return false;
      if (e._firmId && e._firmId === vcFirmId) return true;
      const vc = getVCFirmMatch(e.name);
      return vc?.id === vcFirmId;
    });
    if (idx < 0) return;

    if (idx >= visibleCount) {
      setVisibleCount((c) => Math.max(c, idx + 1));
      return;
    }

    const safeId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(vcFirmId)
        : vcFirmId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    requestAnimationFrame(() => {
      document.querySelector(`[data-vc-firm-id="${safeId}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [isInvestorSearch, investorScrollTo, gridEntries, visibleCount, getVCFirmMatch]);

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
        return { title: "INVESTORS", subtitle: "Browse the full investor directory" };
    }
  }, [activeInvestorTab, userStage, userSector]);

  const operatorHubHeader = useMemo(
    () => ({ title: "OPERATORS", subtitle: "Fractional and advisory talent matched to your profile" }),
    [],
  );

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
      _isTrending: isInvestorTrendingMerged(
        (dbMatch as any)?.is_trending,
        entry._isTrending === true,
        entry.name,
      ),
      _isPopular: (dbMatch as any)?.is_popular ?? entry._isPopular ?? false,
      _isRecent: (dbMatch as any)?.is_recent ?? entry._isRecent ?? false,
      _firmId: (dbMatch as any)?.id ?? vcMatch?.id ?? entry._firmId ?? null,
      _websiteUrl: (dbMatch as any)?.website_url ?? entry._websiteUrl ?? fallbackWebsite ?? null,
      _logoUrl: (dbMatch as any)?.logo_url ?? entry._logoUrl ?? null,
      _strategyClassifications: (dbMatch as any)?.strategy_classifications ?? entry._strategyClassifications ?? null,
      _thesisOrientation: (dbMatch as any)?.thesis_orientation ?? entry._thesisOrientation ?? null,
      _sectorScope: (dbMatch as any)?.sector_scope ?? entry._sectorScope ?? null,
      _thesisVerticals:
        (dbMatch as any)?.thesis_verticals?.length > 0
          ? (dbMatch as any).thesis_verticals
          : entry._thesisVerticals ?? [],
      _geoFocus: (dbMatch as any)?.geo_focus ?? entry._geoFocus ?? null,
      _seedSectors:
        dbMatch && (dbMatch as any)?.thesis_verticals?.length > 0
          ? null
          : entry._seedSectors ?? (entry._sectors?.length ? entry._sectors : null),
    };
  }, [getDbMatch, getVCFirmMatch]);

  const networkDirectorySample = useMemo(() => {
    const row: DirectoryEntry[] = [
      ...realFounderEntries.slice(0, 5),
      ...realCompanyEntries.slice(0, 5),
      ...realOperatorEntries.slice(0, 5),
    ];
    return filterByScope(row, activeScope);
  }, [realFounderEntries, realCompanyEntries, realOperatorEntries, activeScope]);

  const investorCarouselPool = useMemo(() => {
    return vcEntries.map((e) => enrichInvestorSeedEntry(e));
  }, [vcEntries, enrichInvestorSeedEntry]);

  const investorRailSuggested = useMemo(
    () => (isInvestorSearch ? investorCarouselPool.slice(0, 8) : []),
    [isInvestorSearch, investorCarouselPool],
  );
  const investorRailTrending = useMemo(
    () => (isInvestorSearch ? investorCarouselPool.slice(8, 16) : []),
    [isInvestorSearch, investorCarouselPool],
  );

  const networkRailSuggested = useMemo(() => {
    if (isInvestorSearch) return [];
    return [...networkDirectorySample].sort((a, b) => {
      const ma = a.matchReason ? 1 : 0;
      const mb = b.matchReason ? 1 : 0;
      if (mb !== ma) return mb - ma;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [isInvestorSearch, networkDirectorySample]);

  /** Same entity kinds as the Network rails — never reuse the investor-only carousel pool here. */
  const networkRailTrendingPool = useMemo(() => {
    if (isInvestorSearch) return [];
    if (activeScope === "all") {
      return mergedEntries.filter((e) => e.category !== "investor");
    }
    return filterByScope(mergedEntries, activeScope);
  }, [isInvestorSearch, mergedEntries, activeScope]);

  const networkRailTrending = useMemo(() => {
    if (isInvestorSearch) return [];
    const scoped = networkRailTrendingPool;
    const trending = scoped.filter((e) => e._isTrending === true);
    const pool = trending.length >= 4 ? trending : scoped;
    return [...pool].slice(0, 10).sort((a, b) => {
      const ta = a._isTrending === true ? 1 : 0;
      const tb = b._isTrending === true ? 1 : 0;
      if (tb !== ta) return tb - ta;
      const pa = a._isPopular === true ? 1 : 0;
      const pb = b._isPopular === true ? 1 : 0;
      if (pb !== pa) return pb - pa;
      const ra = a._isRecent === true ? 1 : 0;
      const rb = b._isRecent === true ? 1 : 0;
      if (rb !== ra) return rb - ra;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [isInvestorSearch, networkRailTrendingPool]);

  const networkRailSuggestedPreviews = useMemo(
    () => networkRailSuggested.map((e) => directoryEntryToNetworkRailPreview(e)),
    [networkRailSuggested],
  );
  const networkRailTrendingPreviews = useMemo(
    () => networkRailTrending.map((e) => directoryEntryToNetworkRailPreview(e)),
    [networkRailTrending],
  );

  const showInvestorRails =
    isInvestorSearch && (investorRailSuggested.length > 0 || investorRailTrending.length > 0);
  const showNetworkRails =
    !isInvestorSearch && (networkRailSuggested.length > 0 || networkRailTrending.length > 0);

  /** Legacy carousel fallback when the compact rails have nothing to show — keep in sync with rail pools. */
  const scopedSuggested = networkRailSuggested;
  const scopedTrending = networkRailTrending;

  const labels = SCOPE_LABELS[activeScope] ?? SCOPE_LABELS.all;
  const carouselTitles = CAROUSEL_TITLES[activeScope] ?? CAROUSEL_TITLES.all;

  /**
   * Network directory footer counts.
   * For scope "all", a single `visible of sum(totals)` implied one mixed list vs. one grand total and read as a bug.
   * Here we show per-entity loaded / directory totals (same numbers as the founders / companies / operators tabs).
   */
  const networkDirectoryFooterCountText = useMemo(() => {
    if (!directoryDbGrid || isOperatorHubLayout) return null;
    const fmt = (n: number | null | undefined) => (n == null ? "…" : n.toLocaleString());

    if (activeScope === "all") {
      if (communityGrid.loading && visibleGrid.length === 0) {
        return "Loading mixed directory…";
      }
      let foundersShown = 0;
      let companiesShown = 0;
      let operatorsShown = 0;
      for (const e of visibleGrid) {
        if (e.category === "founder") foundersShown++;
        else if (e.category === "company") companiesShown++;
        else if (e.category === "operator") operatorsShown++;
      }
      const { founders: tf, companies: tc, operators: to } = communityGrid.totals;
      return `Founders ${foundersShown}/${fmt(tf)} · Companies ${companiesShown}/${fmt(tc)} · Operators ${operatorsShown}/${fmt(to)}`;
    }

    if (communityGrid.totalForScope != null) {
      return `${visibleGrid.length} of ${communityGrid.totalForScope} ${labels.plural}`;
    }
    return null;
  }, [
    activeScope,
    communityGrid.loading,
    communityGrid.totals.companies,
    communityGrid.totals.founders,
    communityGrid.totals.operators,
    communityGrid.totalForScope,
    directoryDbGrid,
    isOperatorHubLayout,
    labels.plural,
    visibleGrid,
  ]);

  const handleViewAll = useCallback(() => {
    // Scroll to the all grid section
    const allGridSection = document.querySelector('[data-section="all-grid"]');
    if (allGridSection) {
      allGridSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const loadMore = useCallback(() => {
    if (directoryDbGrid) {
      if (!communityGrid.hasMore || communityGrid.loadingMore) return;
      void communityGrid.loadMore();
      return;
    }
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) =>
        Math.min(
          prev + (isInvestorSearch ? INVESTOR_DIRECTORY_LOAD_MORE : PAGE_SIZE),
          textFilteredEntries.length,
        ),
      );
      setIsLoadingMore(false);
    }, 400);
  }, [
    directoryDbGrid,
    communityGrid.hasMore,
    communityGrid.loadingMore,
    communityGrid.loadMore,
    hasMore,
    isLoadingMore,
    textFilteredEntries.length,
    isInvestorSearch,
  ]);

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
    if (isInvestorPersonEntry(entry) && entry._personData) {
      setSelectedInvestor(null);
      setSelectedVCFirm(null);
      setSelectedVCPersonFirm(entry._personFirm ?? null);
      setSelectedVCPerson(entry._personData);
      return;
    }
    setInvestorInitialTab("Updates");
    setSelectedVCPerson(null);
    setSelectedVCPersonFirm(null);
    const vcMatch = getVCFirmMatch(entry.name);
    setSelectedVCFirm(vcMatch ?? null);
    setSelectedInvestor(entry);
  }, [getVCFirmMatch]);

  const handleInvestorPreviewClick = useCallback(
    (inv: InvestorPreviewModel) => {
      const entry =
        mergedEntries.find((e) => e.category === "investor" && e.name === inv.name) ??
        [...investorRailSuggested, ...investorRailTrending].find((e) => e.name === inv.name);
      if (entry) handleInvestorClick(entry);
    },
    [mergedEntries, handleInvestorClick, investorRailSuggested, investorRailTrending],
  );

  const handleDeployingClick = useCallback((entry: DirectoryEntry) => {
    if (isInvestorPersonEntry(entry) && entry._personData) {
      setSelectedInvestor(null);
      setSelectedVCFirm(null);
      setSelectedVCPersonFirm(entry._personFirm ?? null);
      setSelectedVCPerson(entry._personData);
      return;
    }
    setInvestorInitialTab("Activity");
    setSelectedVCPerson(null);
    setSelectedVCPersonFirm(null);
    const vcMatch = getVCFirmMatch(entry.name);
    setSelectedVCFirm(vcMatch ?? null);
    setSelectedInvestor(entry);
  }, [getVCFirmMatch]);

  const selectedInvestorMatchedVCFirm = useMemo(() => {
    if (!selectedInvestor || selectedInvestor.category !== "investor" || !selectedVCFirm) return null;

    const investorKey = normalizeFirmName(selectedInvestor.name);
    const vcFirmKey = normalizeFirmName(selectedVCFirm.name);
    if (investorKey === vcFirmKey) return selectedVCFirm;

    const investorAliasKeys = getAliasKeys(investorKey);
    const vcFirmAliasKeys = getAliasKeys(vcFirmKey);
    if (investorAliasKeys.includes(vcFirmKey) || vcFirmAliasKeys.includes(investorKey)) {
      return selectedVCFirm;
    }

    if (selectedInvestor._firmId && selectedInvestor._firmId === selectedVCFirm.id) {
      return selectedVCFirm;
    }

    const investorWebsiteHost = normalizeWebsiteHost(selectedInvestor._websiteUrl);
    const vcFirmWebsiteHost = normalizeWebsiteHost(selectedVCFirm.website_url);
    if (investorWebsiteHost && vcFirmWebsiteHost && investorWebsiteHost === vcFirmWebsiteHost) {
      return selectedVCFirm;
    }

    return null;
  }, [selectedInvestor, selectedVCFirm]);

  const selectedInvestorVCPeople = useMemo(() => {
    if (!selectedInvestor || selectedInvestor.category !== "investor") return [];
    const selectedName = normalizeFirmName(selectedInvestor.name);
    const selectedAliasKeys = new Set(getAliasKeys(selectedName));
    const matchedFirmId = selectedInvestorMatchedVCFirm?.id ?? selectedInvestor._firmId ?? null;
    return vcPeople.filter((person) => {
      if (person.is_active === false) return false;
      if (!safeTextTrim(person.full_name)) return false;
      if (matchedFirmId && person.firm_id === matchedFirmId) return true;

      const primaryFirm = safeTextTrim(person.primary_firm_name);
      if (primaryFirm) {
        const primaryKeys = getAliasKeys(normalizeFirmName(primaryFirm));
        if (primaryKeys.some((k) => selectedAliasKeys.has(k))) return true;
      }

      const affiliations = Array.isArray(person.affiliations) ? person.affiliations : [];
      for (const aff of affiliations) {
        const affName = safeTextTrim(aff?.firm_name);
        if (!affName) continue;
        const affKeys = getAliasKeys(normalizeFirmName(affName));
        if (affKeys.some((k) => selectedAliasKeys.has(k))) return true;
      }

      return false;
    });
  }, [selectedInvestor, selectedInvestorMatchedVCFirm?.id, vcPeople]);

  const handleInvestorPreviewDeploying = useCallback(
    (inv: InvestorPreviewModel) => {
      const entry =
        mergedEntries.find((e) => e.category === "investor" && e.name === inv.name) ??
        [...investorRailSuggested, ...investorRailTrending].find((e) => e.name === inv.name);
      if (entry) handleDeployingClick(entry);
    },
    [mergedEntries, handleDeployingClick, investorRailSuggested, investorRailTrending],
  );

  const handleNetworkRailClick = useCallback(
    (inv: InvestorPreviewModel) => {
      const cat = inv._railRowKind;
      const pool = [...networkRailSuggested, ...networkRailTrending];
      if (cat === "investor") {
        const entry =
          mergedEntries.find((e) => e.category === "investor" && e.name === inv.name) ??
          pool.find((e) => e.category === "investor" && e.name === inv.name);
        if (entry) handleInvestorClick(entry);
        return;
      }
      if (cat === "company" || cat === "founder" || cat === "operator") {
        const entry =
          mergedEntries.find((e) => e.category === cat && e.name === inv.name) ??
          pool.find((e) => e.category === cat && e.name === inv.name);
        if (entry) setSelectedFounder(entry);
      }
    },
    [mergedEntries, networkRailSuggested, networkRailTrending, handleInvestorClick],
  );

  const logoUrl = (() => {
    try {return localStorage.getItem("company-logo-url") || null;} catch {return null;}
  })();

  const handleAdminRecordSaved = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["investor-directory"] }),
      queryClient.invalidateQueries({ queryKey: ["investor-people-directory"] }),
      queryClient.invalidateQueries({ queryKey: ["investor-profile"] }),
      queryClient.invalidateQueries({ queryKey: ["investor-profile-name"] }),
    ]);
  }, [queryClient]);

  return (
    <div className="space-y-2">
      {/* Spacer for global top nav */}
      {(variant === "investor-search" || isOperatorHubLayout) && <div className="h-2" />}

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        {variant !== "investor-search" && !isOperatorHubLayout && (
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {NETWORK_SURFACE_DISPLAY_NAME}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Discover and connect with founders building the future</p>
          </div>
        )}

        {variant !== "investor-search" && !isOperatorHubLayout && !hasProfile && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Status Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-10 items-center gap-2 rounded-xl border border-amber-200/40 bg-amber-50 px-3 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer group shrink-0" style={{ borderColor: "rgb(252, 211, 77)", backgroundColor: "rgba(255, 251, 235, 0.58)" }}>
                  <div className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                    <span className="text-amber-800/40 uppercase tracking-wide text-[9px]">Open to</span>
                    <span className="text-amber-900 uppercase tracking-tight text-[10px] font-black">
                      {userStatuses.length > 1 
                        ? `${userStatuses[0].replace("_", " ")} +${userStatuses.length - 1}`
                        : userStatuses[0]?.replace("_", " ") || "STATUS"
                      }
                    </span>
                    <ChevronDown className="h-3 w-3 text-amber-700/50" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px] bg-popover/95 backdrop-blur-md border-amber-100 shadow-2xl p-1.5">
                {[
                  { id: "PARTNERSHIPS", label: "Partnerships", icon: Handshake },
                  { id: "HIRING", label: "Hiring", icon: Users },
                  { id: "TRADING_NOTES", label: "Trading Notes", icon: Info },
                  { id: "EXPLORING_IDEAS", label: "Exploring Ideas", icon: Sparkles }
                ].map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleStatus(option.id);
                    }}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold cursor-pointer focus:bg-amber-50 focus:text-amber-900 transition-colors group/item"
                  >
                    <div className="flex items-center gap-2">
                      <option.icon className="h-3.5 w-3.5" />
                      {option.label}
                    </div>
                    {userStatuses.includes(option.id) && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

              <button
                onClick={onNavigateProfile}
                className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-400/5 px-4 hover:border-amber-500 hover:bg-amber-400/10 transition-all cursor-pointer group shrink-0"
              >
              <Building2 className="h-4 w-4 text-amber-600/60" />
              <span className="text-xs text-amber-900/80 font-bold group-hover:text-amber-900 transition-colors">Set up your company</span>
              <ArrowRight className="h-3 w-3 text-amber-600 group-hover:text-amber-700 transition-colors" />
            </button>
          </div>
        )}
      </div>

      {/* ── Smart Cohort Cards (scroll target for GlobalTopNav live pulse) ── */}
      <div
        className="mb-2 scroll-mt-24 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-x-visible"
        data-section="network-pulse-cohorts"
      >
        <div className="flex min-w-max items-stretch gap-2.5 lg:min-w-0 lg:w-full lg:gap-3">
          {cohorts.map((cohort, cohortIdx) => {
            const Icon = cohort.icon;

            if (isInvestorSearch || isOperatorHubLayout) {
              return (
                <button
                  key={cohort.id}
                  type="button"
                  onClick={() => setActiveCohortId(cohort.id)}
                  className={cn(
                    "group flex min-h-0 snap-start shrink-0 flex-col rounded-lg border px-3.5 py-3 text-left",
                    "w-[220px] transition-[border-color,box-shadow,background-color] duration-200 lg:min-w-0 lg:w-auto lg:flex-1",
                    "border-border/42 bg-card/97 shadow-[0_1px_1px_rgba(0,0,0,0.022)] dark:border-white/[0.09] dark:bg-white/[0.038]",
                    "hover:border-border/70 hover:shadow-[0_2px_10px_rgba(0,0,0,0.045)] hover:bg-card dark:hover:border-white/16 dark:hover:bg-white/[0.055]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[10px] font-medium uppercase leading-none tracking-[0.06em] text-muted-foreground">
                      {cohort.cluster}
                    </span>
                    <span
                      className="flex shrink-0 items-center justify-center text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
                      aria-hidden
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </span>
                  </div>

                  <div className="mt-2.5 min-h-[3rem]">
                    <p
                      className={cn(
                        "font-semibold tabular-nums text-foreground",
                        "leading-[0.92] tracking-[-0.028em]",
                        "text-[26px]",
                      )}
                    >
                      {cohort.value}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium leading-[1.25] tracking-[-0.01em] text-foreground/64">
                      {cohort.label}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-border/40 pt-3 dark:border-white/[0.1]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-none tracking-tight text-muted-foreground/85">
                        {cohort.timeframe}
                      </span>
                      <div className="flex shrink-0 items-baseline justify-end gap-2">
                        <RotatingCohortTrendText
                          stats={cohort.trendStats}
                          initialDelayMs={2200 + cohortIdx * 550}
                        />
                        <CohortFooterSparkline cohortId={cohort.id} values={cohort.sparkline} isPrimary={false} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={cohort.id}
                onClick={() => setActiveCohortId(cohort.id)}
                className={[
                  "group relative snap-start shrink-0 flex flex-col justify-between overflow-hidden rounded-xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                  "w-[220px] lg:w-auto lg:min-w-0 lg:flex-1",
                  "border border-border bg-card shadow-sm hover:border-border/80",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                    {cohort.cluster}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                </div>

                <div className="mt-3">
                  <p className="text-[26px] font-bold leading-none tracking-tight text-foreground transition-colors group-hover:text-foreground">
                    {cohort.value}
                  </p>
                  <p className="mt-1.5 text-[12px] font-semibold text-foreground leading-tight">{cohort.label}</p>
                </div>

                {/* Same footer strip as investor-search / Operators cohort cards */}
                <div className="mt-4 border-t border-border/40 pt-3 dark:border-white/[0.1]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-none tracking-tight text-muted-foreground/85">
                      {cohort.timeframe}
                    </span>
                    <div className="flex shrink-0 items-baseline justify-end gap-2">
                      <RotatingCohortTrendText
                        stats={cohort.trendStats}
                        initialDelayMs={2200 + cohortIdx * 550}
                      />
                      <CohortFooterSparkline cohortId={cohort.id} values={cohort.sparkline} isPrimary={false} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Entity Tabs — hidden for investor-search; Investors omitted (dedicated investor-search / nav) */}
      {!isInvestorSearch && (
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/35 p-1 w-fit shadow-sm backdrop-blur-sm">
        {GLOBAL_TABS.filter((t) => t.id !== "investors").map((tab) => {
          const Icon = tab.icon;
          const isActive = activeScope === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setNetworkDirectorySector(NETWORK_DIRECTORY_SECTOR_ALL);
                setNetworkDirectoryStage(NETWORK_DIRECTORY_STAGE_ALL);
                setNetworkDirectorySort("default");
                setActiveCohortId(null);
                setActiveScope(tab.id);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all ${
              isActive ?
              "bg-card text-foreground shadow-sm ring-1 ring-border/60" :
              "text-muted-foreground hover:bg-card/50 hover:text-foreground"}`
              }>
              <Icon className="h-3 w-3 opacity-75" />
              {tab.label}
            </button>);
        })}
      </div>
      )}

      

      {/* ═══════ Best matches + Trending: investor-search = investors; Network = one rail, content follows All / Companies / Founders / Operators ═══════ */}
      {showInvestorRails || showNetworkRails ? (
        showInvestorRails ? (
          <div className="pt-4">
            <InvestorSuggestedTrendingRails
              rowKind="investor"
              suggested={investorRailSuggested.map((e) => directoryEntryToInvestorPreview(e))}
              trending={investorRailTrending.map((e) => directoryEntryToInvestorPreview(e))}
              suggestedTitle="Best matches"
              suggestedSubtitle="Curated matches based on your profile"
              trendingTitle={carouselTitles.trending}
              trendingSubtitle="Most active this week"
              onViewAllSuggested={handleViewAll}
              onViewAllTrending={handleViewAll}
              onPreviewClick={handleInvestorPreviewClick}
              onDeployingClick={handleInvestorPreviewDeploying}
              anchorVcFirmId={(inv) => {
                const entry = mergedEntries.find((x) => x.category === "investor" && x.name === inv.name);
                return entry ? investorAnchorVcFirmId(entry) : null;
              }}
            />
          </div>
        ) : (
          <div className="pt-4">
            <InvestorSuggestedTrendingRails
              key={activeScope}
              rowKind={
                activeScope === "companies"
                  ? "company"
                  : activeScope === "founders"
                    ? "founder"
                    : activeScope === "operators"
                      ? "operator"
                      : "company"
              }
              suggested={networkRailSuggestedPreviews}
              trending={networkRailTrendingPreviews}
              suggestedTitle="Best matches"
              suggestedSubtitle="Curated matches based on your profile"
              trendingTitle={carouselTitles.trending}
              trendingSubtitle={
                activeScope === "all"
                  ? "Most active on the network this week"
                  : `Most active ${labels.plural} this week`
              }
              suggestedStepperLabel={activeScope === "all" ? "Best matches" : undefined}
              trendingStepperLabel={activeScope === "all" ? carouselTitles.trending : undefined}
              onViewAllSuggested={handleViewAll}
              onViewAllTrending={handleViewAll}
              onPreviewClick={handleNetworkRailClick}
              anchorVcFirmId={(inv) => {
                if (inv._railRowKind !== "investor") return null;
                const entry = mergedEntries.find((x) => x.category === "investor" && x.name === inv.name);
                return entry ? investorAnchorVcFirmId(entry) : null;
              }}
            />
          </div>
        )
      ) : !isInvestorSearch && !showNetworkRails ? (
        <>
          {scopedSuggested.length > 0 && (
            <div className="pt-4">
              <FounderCarousel title="Best matches" subtitle="Curated matches based on your profile" onViewAll={handleViewAll}>
                {scopedSuggested.map((entry, i) => (
                  <CarouselCard
                    key={`suggested-${i}`}
                    founder={entry}
                    anchorVcFirmId={investorAnchorVcFirmId(entry)}
                    onClick={() => (entry.category === "investor" ? handleInvestorClick(entry) : setSelectedFounder(entry))}
                    onDeployingClick={() => handleDeployingClick(entry)}
                    showAdminEdit={isAppAdmin && Boolean(getAdminEditableRecord(entry))}
                    onAdminEdit={() => setAdminEditRecord(getAdminEditableRecord(entry))}
                  />
                ))}
              </FounderCarousel>
            </div>
          )}
          {scopedTrending.length > 0 && (
            <div className="pt-4">
              <FounderCarousel title={carouselTitles.trending} subtitle="Most active this week" onViewAll={handleViewAll}>
                {scopedTrending.map((entry, i) => (
                  <CarouselCard
                    key={`trending-${i}`}
                    founder={entry}
                    trending
                    anchorVcFirmId={investorAnchorVcFirmId(entry)}
                    onClick={() => (entry.category === "investor" ? handleInvestorClick(entry) : setSelectedFounder(entry))}
                    onDeployingClick={() => handleDeployingClick(entry)}
                    showAdminEdit={isAppAdmin && Boolean(getAdminEditableRecord(entry))}
                    onAdminEdit={() => setAdminEditRecord(getAdminEditableRecord(entry))}
                  />
                ))}
              </FounderCarousel>
            </div>
          )}
        </>
      ) : null}

      {/* ═══════ All Grid ═══════ */}
      <div className="space-y-3 pt-4" data-section="all-grid">
          {investorDirectoryUnavailable && (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-4 text-sm text-foreground">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="font-semibold">Live investor directory unavailable</p>
                  <p className="text-muted-foreground">
                    Investor cards are hidden until the live VC firm directory loads successfully. The app will not fall back to the tiny seed list anymore.
                    {vcDirectoryError ? ` ${vcDirectoryError}` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Dynamic header for investor tabs */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                {isInvestorSearch
                  ? investorTabHeader.title
                  : isOperatorHubLayout
                    ? operatorHubHeader.title
                    : `All ${labels.plural.charAt(0).toUpperCase() + labels.plural.slice(1)}`}
              </h2>
              {(isInvestorSearch || isOperatorHubLayout) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {isInvestorSearch ? investorTabHeader.subtitle : operatorHubHeader.subtitle}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {isInvestorSearch && (
                <Select
                  value={investorSort}
                  onValueChange={(v) => setInvestorSort(v as InvestorSortValue)}
                >
                  <SelectTrigger
                    aria-label="Sort investors"
                    className="h-8 w-[min(100%,11.5rem)] shrink-0 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-[11px] font-medium shadow-sm sm:w-[11.5rem]"
                  >
                    <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent align="end" className="min-w-[12rem]">
                    {INVESTOR_SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {directoryDbGrid && !isInvestorSearch && (
                <>
                  <Select
                    value={effectiveNetworkDirectorySort}
                    onValueChange={(v) => setNetworkDirectorySort(v as NetworkDirectorySortValue)}
                  >
                    <SelectTrigger
                      aria-label="Sort directory"
                      className="h-8 w-[min(100%,12rem)] shrink-0 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-[11px] font-medium shadow-sm sm:w-[12rem]"
                    >
                      <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent align="end" className="min-w-[12rem]">
                      {networkDirectorySortOptionsForUi.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={networkDirectorySector}
                    onValueChange={setNetworkDirectorySector}
                  >
                    <SelectTrigger
                      aria-label="Filter by sector"
                      className="h-8 w-[min(100%,9.5rem)] shrink-0 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-[11px] font-medium shadow-sm sm:w-[9.5rem]"
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <SelectValue placeholder="Sector" />
                    </SelectTrigger>
                    <SelectContent align="end" className="min-w-[10rem] max-h-[min(22rem,var(--radix-select-content-available-height))]">
                      <SelectItem value={NETWORK_DIRECTORY_SECTOR_ALL} className="text-xs">
                        All sectors
                      </SelectItem>
                      {networkSectorOptions.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={networkDirectoryStage}
                    onValueChange={setNetworkDirectoryStage}
                  >
                    <SelectTrigger
                      aria-label="Filter by stage"
                      className="h-8 w-[min(100%,9.5rem)] shrink-0 gap-1.5 rounded-lg border-border/80 bg-background/80 px-2.5 text-[11px] font-medium shadow-sm sm:w-[9.5rem]"
                    >
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent align="end" className="min-w-[10rem] max-h-[min(22rem,var(--radix-select-content-available-height))]">
                      <SelectItem value={NETWORK_DIRECTORY_STAGE_ALL} className="text-xs">
                        All stages
                      </SelectItem>
                      {networkStageOptions.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <span className="text-[10px] text-muted-foreground font-mono uppercase tabular-nums">
                {networkDirectoryFooterCountText != null
                  ? networkDirectoryFooterCountText
                  : directoryDbGrid && communityGrid.totalForScope != null
                    ? `${visibleGrid.length} of ${communityGrid.totalForScope} ${
                        isOperatorHubLayout ? "operators" : labels.plural
                      }`
                    : `${visibleGrid.length} of ${gridEntries.length} ${
                        isInvestorSearch ? "investors" : isOperatorHubLayout ? "operators" : labels.plural
                      }`}
              </span>
            </div>
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
          ) : communityGrid.loading && directoryDbGrid ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <FounderCardSkeleton key={`dir-skel-${i}`} />
              ))}
            </div>
          ) : visibleGrid.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`network-directory-${activeScope}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleGrid.map((founder, i) =>
                    <FounderCard
                      key={`all-${founder.category === "investor" ? investorAnchorVcFirmId(founder) ?? founder.name : founder._profileId ?? founder.name}-${i}`}
                      founder={founder}
                      operatorHubLayout={isOperatorHubLayout}
                      anchorVcFirmId={investorAnchorVcFirmId(founder)}
                      onClick={() => founder.category === "investor" ? handleInvestorClick(founder) : setSelectedFounder(founder)}
                      onDeployingClick={() => handleDeployingClick(founder)}
                      showAdminEdit={isAppAdmin && Boolean(getAdminEditableRecord(founder))}
                      onAdminEdit={() => setAdminEditRecord(getAdminEditableRecord(founder))}
                    />
                  )}
                  {gridLoadingMore &&
                    Array.from({ length: 3 }).map((_, i) =>
                      <FounderCardSkeleton key={`loading-${i}`} />
                    )}
                </div>
                <div ref={sentinelRef} className="h-1" />
                {hasMore && !gridLoadingMore &&
                  <div className="flex justify-center pt-2">
                    <button onClick={loadMore} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 shadow-sm hover:shadow-md transition-all">
                      Load more
                    </button>
                  </div>
                }
                {gridLoadingMore &&
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
                  : isOperatorHubLayout
                    ? "No operators yet"
                    : "Entity Not Found"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {isInvestorSearch && activeInvestorTab === "matches"
                  ? "Update your company profile to unlock AI-driven investor matching."
                  : isOperatorHubLayout
                    ? "No operators match your current filters. Try another tab or widen your search."
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

      {/* ── Cohort Detail Drawer ── */}
      <AnimatePresence>
        {activeCohortId && (() => {
          const cohort = cohorts.find((c) => c.id === activeCohortId);
          if (!cohort) return null;
          const Icon = cohort.icon;
          return (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setActiveCohortId(null)}
              />
              <motion.div
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-card shadow-2xl border-l border-border"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
              >
                {/* Header */}
                <div className="shrink-0 border-b border-border bg-card px-5 pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-lg bg-muted p-1.5 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{cohort.cluster}</p>
                        <p className="text-sm font-semibold text-foreground leading-tight">{cohort.label}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveCohortId(null)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-end gap-3">
                    <p className="text-[34px] font-bold leading-none tracking-tight text-foreground">
                      {cohort.value}
                    </p>
                    <div className="mb-1 flex flex-col gap-0.5">
                      <span className={[
                        "text-[11px] font-medium",
                        cohort.trendStats[0].trendUp ? "text-emerald-600" : "text-rose-500",
                      ].join(" ")}>
                        {cohort.trendStats[0].trend}
                      </span>
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">{cohort.timeframe}</span>
                    </div>
                    <div className="mb-1.5 ml-auto flex items-end gap-[2px]" aria-hidden>
                      {cohort.sparkline.map((bar, idx) => (
                        <span
                          key={idx}
                          className="w-[4px] rounded-[2px] bg-muted-foreground/35"
                          style={{ height: `${Math.max(5, bar * 3)}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Entry list */}
                <div className="flex-1 overflow-y-auto py-3">
                  {cohortDetailEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                      <Icon className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No entries found</p>
                      <p className="text-xs text-muted-foreground/70">Complete your profile to see more matches.</p>
                    </div>
                  ) : (
                    cohortDetailEntries.map((entry, i) => (
                      <button
                        key={`detail-${i}`}
                        onClick={() => {
                          setActiveCohortId(null);
                          setTimeout(() => {
                            if (entry.category === "investor") {
                              const vcMatch = getVCFirmMatch(entry.name);
                              if (vcMatch) setSelectedVCFirm(vcMatch);
                              setSelectedInvestor(entry);
                            } else {
                              setSelectedFounder(entry);
                            }
                          }, 220);
                        }}
                        className="group w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
                      >
                        <div className="shrink-0 h-9 w-9 rounded-xl bg-secondary flex items-center justify-center text-sm font-bold text-foreground border border-border/50">
                          {entry.initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">{entry.name}</p>
                            {entry.matchReason && (
                              <span className="shrink-0 inline-flex items-center rounded-full bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[9px] font-semibold text-accent uppercase tracking-wide">
                                match
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.location} · {entry.stage}</p>
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">{entry.description}</p>
                        </div>
                        <ArrowRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-accent transition-colors mt-1" />
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* Detail Panels */}
      <FounderDetailPanel
        founder={selectedFounder}
        companyName={companyData?.name}
        organizationId={
          selectedFounder?.category === "company" && isUuid(selectedFounder._firmId)
            ? String(selectedFounder._firmId).trim()
            : null
        }
        onClose={() => setSelectedFounder(null)} />
      <InvestorDetailPanel
        investor={
          selectedInvestor
            ? {
                ...selectedInvestor,
                category: "investor" as const,
                investorDatabaseId:
                  typeof selectedInvestor._firmId === "string" &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    selectedInvestor._firmId.trim(),
                  )
                    ? selectedInvestor._firmId.trim()
                    : null,
                /** Panel reads `logo_url`; directory cards use `_logoUrl` (+ VC JSON match). */
                logo_url: selectedInvestor._logoUrl ?? selectedInvestorMatchedVCFirm?.logo_url ?? null,
                websiteUrl: selectedInvestor._websiteUrl ?? selectedInvestorMatchedVCFirm?.website_url ?? null,
              }
            : null
        }
        companyName={companyData?.name}
        companyData={companyData ? { name: companyData.name, sector: companyData.sector, stage: companyData.stage, model: companyData.businessModel?.join(", "), description: companyData.description } : null}
        onClose={() => {
          // Also dismiss any open person modal when the firm panel closes
          setSelectedVCPerson(null);
          setSelectedVCPersonFirm(null);
          setSelectedInvestor(null);
          setSelectedVCFirm(null);
          setInvestorInitialTab("Updates");
        }}
        hideBackdrop={!!selectedVCPerson}
        initialTab={investorInitialTab}
        vcFirm={selectedInvestorMatchedVCFirm}
        vcPartners={selectedInvestorVCPeople}
        onSelectPerson={(person) => {
          // Keep the firm panel open — person modal layers on top (same z-index, later in DOM).
          // "Back to <firm>" simply dismisses the person modal; firm panel is already visible.
          setSelectedVCPersonFirm(selectedInvestorMatchedVCFirm ?? getFirmForPerson(person.id) ?? null);
          setSelectedVCPerson(person);
        }}
        onCloseVCFirm={() => setSelectedVCFirm(null)}
      />
      <PersonProfileModal
        person={selectedVCPerson}
        firm={selectedVCPerson ? (selectedVCPersonFirm ?? getFirmForPerson(selectedVCPerson.id)) : null}
        onClose={() => {
          setSelectedVCPerson(null);
          setSelectedVCPersonFirm(null);
        }}
        onNavigateToFirm={() => {
          // Firm panel is still open behind this modal — just close the person modal
          setSelectedVCPerson(null);
          setSelectedVCPersonFirm(null);
        }}
      />
      <AdminRecordEditDialog
        record={adminEditRecord}
        open={Boolean(adminEditRecord)}
        onOpenChange={(next) => {
          if (!next) setAdminEditRecord(null);
        }}
        onSaved={handleAdminRecordSaved}
      />
      
    </div>);

}
