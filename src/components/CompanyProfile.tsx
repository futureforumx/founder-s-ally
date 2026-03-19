import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, type FocusEvent } from "react";
import { toast } from "@/hooks/use-toast";
import { Building2, Globe, Upload, FileText, AlertCircle, Loader2, Check, Camera, MapPin, Users, TrendingUp, DollarSign, Target, Briefcase, Lock, AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Pencil, Twitter, Linkedin, Instagram, ChevronDown, X, Info } from "lucide-react";
import { InsightIcon } from "./company-profile/InsightIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { SectorClassification } from "@/components/SectorTags";
import { Badge } from "@/components/ui/badge";
import { ProfileField } from "./company-profile/ProfileField";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CompetitorTagInput } from "./company-profile/CompetitorTagInput";
import { LocationAutocomplete } from "./company-profile/LocationAutocomplete";
import { SectorSubsectorPicker } from "./company-profile/SectorSubsectorPicker";
import { TaxonomyCombobox } from "./company-profile/TaxonomyCombobox";
import { normalizeSector } from "./company-profile/sectorNormalization";
import {
  STAGE_OPTIONS, SECTOR_OPTIONS, BUSINESS_MODEL_OPTIONS, TARGET_CUSTOMER_OPTIONS,
  type SectorOption,
} from "@/constants/taxonomy";
import {
  CompanyData, AnalysisResult, EMPTY_FORM,
  stages, sectors, businessModels, targetCustomers,
  getCompletionPercent, subsectorsFor,
} from "./company-profile/types";

export type { CompanyData, AnalysisResult, ConfidenceLevel, MetricWithConfidence } from "./company-profile/types";

type AnalyzeStepKey = "scraping" | "analyzing" | "deepSearch" | "verifying" | "mapping" | "";
const STEP_LABELS: Record<AnalyzeStepKey, string> = {
  scraping: "Parsing Deck Structure...",
  analyzing: "Cross-referencing with live market data...",
  deepSearch: "Running Deep Search for recent filings...",
  verifying: "Verifying Headquarters via recent filings...",
  mapping: "Mapping Competitive Landscape...",
  "": "",
};

const TLDS = [".com", ".io", ".ai", ".org", ".net", ".co", ".dev", ".app", ".xyz", ".tech", ".gg", ".so", ".sh"];

function extractDomain(url: string): string | null {
  try {
    let u = url.trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const hostname = new URL(u).hostname.replace(/^www\./, "");
    return hostname || null;
  } catch { return null; }
}

function faviconSrc(domain: string): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
}

function cleanDomainToName(domain: string): string {
  let name = domain.replace(/^www\./, "");
  for (const tld of TLDS) {
    if (name.endsWith(tld)) { name = name.slice(0, -tld.length); break; }
  }
  const parts = name.split(".");
  name = parts[parts.length - 1];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseSmartNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.toString().toLowerCase().replace(/[^0-9.kmb]/g, "");
  const match = cleaned.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") num *= 1_000;
  if (suffix === "m") num *= 1_000_000;
  if (suffix === "b") num *= 1_000_000_000;
  return num;
}

function formatWithCommas(num: number): string {
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ── Metric period conversion helpers ──
function mrrToArr(mrr: string): string {
  const n = parseSmartNumber(mrr);
  return n ? formatWithCommas(n * 12) : "";
}
function arrToMrr(arr: string): string {
  const n = parseSmartNumber(arr);
  return n ? formatWithCommas(Math.round(n / 12)) : "";
}
function momToYoy(mom: string): string {
  const n = parseSmartNumber(mom);
  if (!n) return "";
  const yoy = (Math.pow(1 + n / 100, 12) - 1) * 100;
  return formatWithCommas(Math.round(yoy));
}
function yoyToMom(yoy: string): string {
  const n = parseSmartNumber(yoy);
  if (!n) return "";
  const mom = (Math.pow(1 + n / 100, 1 / 12) - 1) * 100;
  return mom.toFixed(1).replace(/\.0$/, "");
}

interface CompanyProfileProps {
  onSave?: (data: CompanyData) => void;
  onAnalysis?: (result: AnalysisResult) => void;
  onSectorChange?: (classification: SectorClassification) => void;
  onStageClassification?: (data: { detected_stage: string; confidence_score: number; reasoning: string; conflicting_signals?: string }) => void;
  onProfileVerified?: (verified: boolean) => void;
  onWalkthroughComplete?: () => void;
}

export interface CompanyProfileHandle {
  triggerAnalysis: () => void;
  isAnalyzing: boolean;
  canAnalyze: boolean;
  analyzeStepLabel: string;
}

// ── Thin Phosphor-style provenance icons ──
function PhosphorSparkle({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M197.58,129.06l-51.61-19-19-51.65a4,4,0,0,0-7.5,0l-19,51.65-51.65,19a4,4,0,0,0,0,7.5l51.65,19,19,51.61a4,4,0,0,0,7.5,0l19-51.61,51.61-19a4,4,0,0,0,0-7.5Zm-54.08,20a4,4,0,0,0-2.47,2.47L128,185.09l-13-33.56a4,4,0,0,0-2.47-2.47L79,136l33.56-13a4,4,0,0,0,2.47-2.47L128,87l13,33.56a4,4,0,0,0,2.47,2.47L177.05,136ZM144,40a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12,4,4,0,0,1,4,4Zm4,4a12,12,0,0,1,12-12,4,4,0,0,1,0,8,4,4,0,0,0-4,4,4,4,0,0,1-8,0Zm-12,12a4,4,0,0,1,4,4,12,12,0,0,1-12,12,4,4,0,0,1,0-8,4,4,0,0,0,4-4A4,4,0,0,1,136,56Zm-8,0a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,128,56ZM220,92a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,220,92Zm4,4a12,12,0,0,1,12-12,4,4,0,0,1,0,8,4,4,0,0,0-4,4,4,4,0,0,1-8,0Zm-12,12a4,4,0,0,1,4,4,12,12,0,0,1-12,12,4,4,0,0,1,0-8,4,4,0,0,0,4-4A4,4,0,0,1,212,108Zm-8,0a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,204,108Z"/>
    </svg>
  );
}

function PhosphorPencilSimple({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M225.9,74.78,181.21,30.09a14,14,0,0,0-19.8,0L38.1,153.41a13.94,13.94,0,0,0-4.1,9.9V208a14,14,0,0,0,14,14H92.69a13.94,13.94,0,0,0,9.9-4.1L225.9,94.58a14,14,0,0,0,0-19.8ZM94.1,209.41a2,2,0,0,1-1.41.59H48a2,2,0,0,1-2-2V163.31a2,2,0,0,1,.59-1.41L136,72.49,183.51,120ZM217.41,86.1,192,111.51,144.49,64,169.9,38.58a2,2,0,0,1,2.83,0l44.68,44.69a2,2,0,0,1,0,2.83Z"/>
    </svg>
  );
}

// ── Phosphor-thin section header icons ──
function PhosphorBriefcase({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M216,60H172V48a20,20,0,0,0-20-20H104A20,20,0,0,0,84,48V60H40A12,12,0,0,0,28,72V208a12,12,0,0,0,12,12H216a12,12,0,0,0,12-12V72A12,12,0,0,0,216,60ZM92,48a12,12,0,0,1,12-12h48a12,12,0,0,1,12,12V60H92ZM220,72V116.43A180,180,0,0,1,128,140a180,180,0,0,1-92-23.57V72a4,4,0,0,1,4-4H216A4,4,0,0,1,220,72Zm0,136a4,4,0,0,1-4,4H40a4,4,0,0,1-4-4V125.45A188.14,188.14,0,0,0,128,148a188.14,188.14,0,0,0,92-22.55ZM108,112a4,4,0,0,1,4-4h32a4,4,0,0,1,0,8H112A4,4,0,0,1,108,112Z"/>
    </svg>
  );
}

function PhosphorCrosshair({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M228,128a4,4,0,0,1-4,4H196.1A68.1,68.1,0,0,1,132,195.9V224a4,4,0,0,1-8,0V195.9A68.1,68.1,0,0,1,59.9,132H32a4,4,0,0,1,0-8H59.9A68.1,68.1,0,0,1,124,60.1V32a4,4,0,0,1,8,0V60.1A68.1,68.1,0,0,1,196.1,124H224A4,4,0,0,1,228,128Zm-100,60a60,60,0,1,0-60-60A60.07,60.07,0,0,0,128,188Zm0-112a52,52,0,1,0,52,52A52.06,52.06,0,0,0,128,76Z"/>
    </svg>
  );
}

function PhosphorChartLine({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M228,128a4,4,0,0,1-4,4H132v96a4,4,0,0,1-8,0V132H28a4,4,0,0,1,0-8h96V28a4,4,0,0,1,8,0v96h96A4,4,0,0,1,228,128Z" opacity="0"/>
      <path d="M228,56V208a12,12,0,0,1-12,12H40a12,12,0,0,1-12-12V48a4,4,0,0,1,8,0V208a4,4,0,0,0,4,4H216a4,4,0,0,0,4-4V56a4,4,0,0,1,8,0ZM72,192a4,4,0,0,0,4-4V112a4,4,0,0,0-8,0v76A4,4,0,0,0,72,192Zm40,0a4,4,0,0,0,4-4V80a4,4,0,0,0-8,0V188A4,4,0,0,0,112,192Zm40,0a4,4,0,0,0,4-4V104a4,4,0,0,0-8,0v84A4,4,0,0,0,152,192Zm40,0a4,4,0,0,0,4-4V72a4,4,0,0,0-8,0V188A4,4,0,0,0,192,192Z"/>
    </svg>
  );
}

function PhosphorShareNetwork({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M176,164a36,36,0,0,0-27.86,13.17L95.2,144.85a35.92,35.92,0,0,0,0-33.7l52.94-32.32A36,36,0,1,0,140.2,68.85L87.26,101.17a36,36,0,1,0,0,53.66l52.94,32.32A36,36,0,1,0,176,164Zm0-136a28,28,0,1,1-28,28A28,28,0,0,1,176,28ZM64,156a28,28,0,1,1,28-28A28,28,0,0,1,64,156Zm112,72a28,28,0,1,1,28-28A28,28,0,0,1,176,228Z"/>
    </svg>
  );
}

// ── Field provenance icon: AI vs Edited ──
function FieldBadge({ isAi }: { isAi: boolean }) {
  if (isAi) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default">
            <PhosphorSparkle className="h-3.5 w-3.5 text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">✨ AI Suggested (Review to approve)</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">
          <PhosphorPencilSimple className="h-3.5 w-3.5 text-primary" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">✏️ Manually modified by you</TooltipContent>
    </Tooltip>
  );
}

export const CompanyProfile = forwardRef<CompanyProfileHandle, CompanyProfileProps>(function CompanyProfile({ onSave, onAnalysis, onSectorChange, onStageClassification, onProfileVerified, onWalkthroughComplete }, ref) {
  const [form, setForm] = useState<CompanyData>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const p = JSON.parse(saved);
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(p)) {
          if (v === null || v === undefined || v === "null") {
            sanitized[k] = Array.isArray(EMPTY_FORM[k as keyof CompanyData]) ? [] : "";
          } else {
            sanitized[k] = v;
          }
        }
        const tc = sanitized.targetCustomer;
        const targetCustomerArr = Array.isArray(tc) ? tc.filter(Boolean) : (typeof tc === "string" && tc ? [tc] : []);
        return { ...EMPTY_FORM, ...sanitized, competitors: Array.isArray(sanitized.competitors) ? sanitized.competitors.filter(Boolean) : [], subsectors: Array.isArray(sanitized.subsectors) ? sanitized.subsectors.filter(Boolean) : [], targetCustomer: targetCustomerArr };
      }
    } catch {}
    return { ...EMPTY_FORM };
  });

  // Favicon state
  const [faviconUrl, setFaviconUrl] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const p = JSON.parse(saved);
        const domain = p.website ? extractDomain(p.website) : null;
        if (domain) return faviconSrc(domain);
      }
    } catch {}
    return null;
  });
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const faviconDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload favicon on mount for saved website
  useEffect(() => {
    if (faviconUrl && !faviconLoaded) {
      const img = new Image();
      img.onload = () => setFaviconLoaded(true);
      img.onerror = () => { setFaviconUrl(null); setFaviconLoaded(false); };
      img.src = faviconUrl;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [userTouched, setUserTouched] = useState<Set<keyof CompanyData>>(() => {
    try {
      const saved = localStorage.getItem("company-profile-touched");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const [aiSuggestions, setAiSuggestions] = useState<Partial<Record<keyof CompanyData, string>>>({});
  const [aiSuggestedSubsectors, setAiSuggestedSubsectors] = useState<string[]>([]);
  const [aiOverflowSubsectors, setAiOverflowSubsectors] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(() => {
    try { return localStorage.getItem("company-profile-confirmed") === "true"; } catch { return false; }
  });

  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [deckText, setDeckText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const outputSectionsRef = useRef<HTMLDivElement>(null);
  const [analyzeStep, setAnalyzeStep] = useState<AnalyzeStepKey>("");
  const [error, setError] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [hasNewInputs, setHasNewInputs] = useState(false);
  const [showOverrideWarning, setShowOverrideWarning] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("company-logo-url"); } catch { return null; }
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [suggestedLogoUrl, setSuggestedLogoUrl] = useState<string | null>(null);
  const [logoSyncBadge, setLogoSyncBadge] = useState(false);
  const logoSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<string | null>(null);
  const [websiteMarkdown, setWebsiteMarkdown] = useState("");
  const [sectorClassification, setSectorClassification] = useState<SectorClassification | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track last-analyzed data sources for smart button state
  const [lastAnalyzedInputs, setLastAnalyzedInputs] = useState<{ url: string; hasDeck: boolean } | null>(() => {
    try {
      const saved = localStorage.getItem("company-last-analyzed-inputs");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [fieldsEditedSinceAnalysis, setFieldsEditedSinceAnalysis] = useState(false);
  const dataSourcesChanged = !lastAnalyzedInputs || form.website !== lastAnalyzedInputs.url || (!!deckText) !== lastAnalyzedInputs.hasDeck || fieldsEditedSinceAnalysis;

  const [metricsUnlocked, setMetricsUnlocked] = useState(() => {
    try { return localStorage.getItem("company-metrics-unlocked") === "true"; } catch { return false; }
  });
  const [scanningMetrics, setScanningMetrics] = useState(false);
  const [aiCompetitors, setAiCompetitors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("company-ai-competitors");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("company-verified-fields");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [metricsConfirmed, setMetricsConfirmed] = useState(() => {
    try { return localStorage.getItem("company-metrics-confirmed") === "true"; } catch { return false; }
  });
  const [metricSources, setMetricSources] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("company-metric-sources");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [sourceVerification, setSourceVerification] = useState<Record<string, { sources: string[]; status: string; conflictDetail?: string }>>(() => {
    try {
      const saved = localStorage.getItem("company-source-verification");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [stageClassification, setStageClassification] = useState<{
    detected_stage: string; confidence_score: number; reasoning: string; conflicting_signals?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem("company-stage-classification");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [dataSource, setDataSource] = useState<"ai" | "deck" | "manual">(() => {
    try { return (localStorage.getItem("company-data-source") as any) || "ai"; } catch { return "ai"; }
  });
  const [originalFormSnapshot, setOriginalFormSnapshot] = useState<CompanyData | null>(null);
  const [aiUpdatedFields, setAiUpdatedFields] = useState<Set<string>>(new Set());

  // Per-section confirmation state
  const [sectionConfirmed, setSectionConfirmed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("company-section-confirmed");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const REVIEW_ORDER = ["overview", "positioning", "metrics", "social"] as const;
  const [activeReviewSection, setActiveReviewSection] = useState<string | null>(null);
  const isInReviewMode = activeReviewSection !== null;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // Will be computed properly by the smart resumption useEffect on mount
    return { overview: false, positioning: false, metrics: false, social: false };
  });
  const hasRunSmartResumption = useRef(false);

  // Walkthrough mode: highlights empty fields with pulse
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const walkthroughTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({
    overview: null, positioning: null, metrics: null, social: null,
  });

  // Validation error state for overview fields
  const [overviewValidationErrors, setOverviewValidationErrors] = useState<Set<string>>(new Set());
  const validationPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overviewApproveLabel, setOverviewApproveLabel] = useState<string | null>(null);

  // Monthly / Annual toggle
  const [metricPeriod, setMetricPeriod] = useState<"monthly" | "annual">(() => {
    try { return (localStorage.getItem("company-metric-period") as any) || "monthly"; } catch { return "monthly"; }
  });

  const completion = getCompletionPercent(form);
  const METRIC_FIELDS: (keyof CompanyData)[] = ["currentARR", "yoyGrowth", "totalHeadcount"];

  // Auto-save
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem("company-profile", JSON.stringify(form));
        localStorage.setItem("company-profile-touched", JSON.stringify([...userTouched]));
        localStorage.setItem("company-verified-fields", JSON.stringify([...verifiedFields]));
        localStorage.setItem("company-metrics-unlocked", String(metricsUnlocked));
        localStorage.setItem("company-metrics-confirmed", String(metricsConfirmed));
        localStorage.setItem("company-metric-sources", JSON.stringify(metricSources));
        localStorage.setItem("company-source-verification", JSON.stringify(sourceVerification));
        localStorage.setItem("company-metric-period", metricPeriod);
        localStorage.setItem("company-section-confirmed", JSON.stringify(sectionConfirmed));
        if (stageClassification) localStorage.setItem("company-stage-classification", JSON.stringify(stageClassification));
        if (form.name) { setSaveIndicator("Auto-saving"); }
      } catch {}
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form, userTouched, metricPeriod, sectionConfirmed]);

  useEffect(() => {
    if (analysisComplete && form.name) onSave?.(form);
  }, [form, analysisComplete]);

  useEffect(() => {
    try {
      if (logoUrl) localStorage.setItem("company-logo-url", logoUrl);
      else localStorage.removeItem("company-logo-url");
    } catch {}
  }, [logoUrl]);

  useEffect(() => {
    try { localStorage.setItem("company-profile-confirmed", String(confirmed)); } catch {}
  }, [confirmed]);

  useEffect(() => {
    try { localStorage.setItem("company-data-source", dataSource); } catch {}
  }, [dataSource]);

  // Restore on mount
  useEffect(() => {
    if (form.name) {
      onSave?.(form);
      try {
        const savedAnalysis = localStorage.getItem("company-analysis");
        if (savedAnalysis) {
          onAnalysis?.(JSON.parse(savedAnalysis));
          setAnalysisComplete(true);
        }
      } catch {}
      try {
        if (localStorage.getItem("company-profile-verified") === "true" && confirmed) {
          onProfileVerified?.(true);
        }
      } catch {}
    }
  }, []);

  // Smart Resumption: determine initial accordion state based on approval status
  useEffect(() => {
    if (hasRunSmartResumption.current) return;
    hasRunSmartResumption.current = true;

    const allApproved = REVIEW_ORDER.every(s => sectionConfirmed[s]);
    if (allApproved) {
      // Fully complete → all collapsed for a clean dashboard view
      setOpenSections({ overview: false, positioning: false, metrics: false, social: false });
    } else {
      // Find first unapproved section and expand only that one
      const newOpen: Record<string, boolean> = {};
      let foundFirst = false;
      for (const s of REVIEW_ORDER) {
        if (!sectionConfirmed[s] && !foundFirst) {
          newOpen[s] = true;
          foundFirst = true;
        } else {
          newOpen[s] = false;
        }
      }
      setOpenSections(newOpen);
    }
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { setError("Logo must be under 5 MB."); return; }
    setUploadingLogo(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("company-logos").getPublicUrl(path);
      setLogoUrl(publicUrl);
      // Clear logo validation error and revoke section confirmation
      setOverviewValidationErrors(prev => { const n = new Set(prev); n.delete("logo"); return n; });
      if (sectionConfirmed.overview) setSectionConfirmed(prev => ({ ...prev, overview: false }));
    } catch (e: any) {
      setError(e.message || "Logo upload failed");
    } finally { setUploadingLogo(false); }
  };

  const OUTPUT_FIELDS: (keyof CompanyData)[] = ["description", "stage", "sector", "businessModel", "targetCustomer", "hqLocation", "uniqueValueProp", "currentARR", "yoyGrowth", "totalHeadcount", "competitors"];
  const hasManualEdits = OUTPUT_FIELDS.some(f => userTouched.has(f) && form[f] && (Array.isArray(form[f]) ? (form[f] as string[]).length > 0 : String(form[f]).trim() !== ""));

  const handleAnalyzeClick = () => {
    if (hasManualEdits) setShowOverrideWarning(true);
    else handleAnalyze();
  };

  // Map fields to their confirmation sections
  const fieldToSection: Record<string, string> = {
    stage: "overview", sector: "overview", subsectors: "overview", businessModel: "overview", targetCustomer: "overview", hqLocation: "overview",
    uniqueValueProp: "positioning", competitors: "positioning",
    currentARR: "metrics", yoyGrowth: "metrics", momGrowth: "metrics", totalHeadcount: "metrics", burnRate: "metrics", ltv: "metrics", cac: "metrics", nrr: "metrics",
    socialTwitter: "social", socialLinkedin: "social", socialInstagram: "social",
  };

  const update = (field: keyof CompanyData, value: string | string[]) => {
    const sanitized = value === "null" || value === null ? (Array.isArray(value) ? [] : "") : value;
    setForm(prev => ({ ...prev, [field]: sanitized }));
    setUserTouched(prev => new Set(prev).add(field));
    setConfirmed(false);
    setAiSuggestions(prev => { const n = { ...prev }; delete n[field]; return n; });
    setAiUpdatedFields(prev => { const n = new Set(prev); n.delete(field); return n; });
    // Reset section confirmation when any field in that section is edited
    const section = fieldToSection[field as string];
    if (section && sectionConfirmed[section]) {
      setSectionConfirmed(prev => ({ ...prev, [section]: false }));
    }
    // Clear validation error for this field
    if (overviewValidationErrors.has(field)) {
      setOverviewValidationErrors(prev => { const n = new Set(prev); n.delete(field); return n; });
    }
    // Mark that fields have been manually edited since last analysis
    if (analysisComplete) {
      setFieldsEditedSinceAnalysis(true);
    }
    if (METRIC_FIELDS.includes(field)) {
      setVerifiedFields(prev => new Set(prev).add(field));
    }
    const manualTrackFields: (keyof CompanyData)[] = ["currentARR", "totalHeadcount", "stage", "sector"];
    if (manualTrackFields.includes(field)) {
      if (dataSource !== "manual") {
        if (!originalFormSnapshot) setOriginalFormSnapshot({ ...form });
        setDataSource("manual");
      }
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".txt")) { setError("Please upload a PDF or TXT file."); return; }
    if (file.size > 50 * 1024 * 1024) { setError("File too large. Maximum 50 MB."); return; }
    setError(null);
    setDeckFile(file);
    if (analysisComplete) setHasNewInputs(true);
    try {
      if (name.endsWith(".txt")) { setDeckText(await file.text()); }
      else {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ")}`);
        }
        setDeckText(pages.join("\n\n"));
      }
      setMetricsUnlocked(true);
      setScanningMetrics(true);
      setTimeout(() => setScanningMetrics(false), 2500);
    } catch { setError("Failed to read file. Try a different format."); }
  }, [analysisComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const applyAiData = (aiExtracted: AnalysisResult["aiExtracted"], sectorMapping?: AnalysisResult["sectorMapping"]) => {
    if (!aiExtracted) return;
    const newSuggestions: Partial<Record<keyof CompanyData, string>> = {};
    const updatedFields = new Set<string>();
    const fieldMap: { key: keyof CompanyData; aiKey: keyof NonNullable<AnalysisResult["aiExtracted"]> }[] = [
      { key: "description", aiKey: "description" },
      { key: "stage", aiKey: "stage" },
      { key: "businessModel", aiKey: "businessModel" },
      { key: "targetCustomer", aiKey: "targetCustomer" },
      { key: "hqLocation", aiKey: "hqLocation" },
      { key: "uniqueValueProp", aiKey: "uniqueValueProp" },
      { key: "currentARR", aiKey: "currentARR" },
      { key: "yoyGrowth", aiKey: "yoyGrowth" },
      { key: "totalHeadcount", aiKey: "totalHeadcount" },
      { key: "socialTwitter", aiKey: "socialTwitter" },
      { key: "socialLinkedin", aiKey: "socialLinkedin" },
      { key: "socialInstagram", aiKey: "socialInstagram" },
    ];

    const normalized = normalizeSector(aiExtracted.sector, sectorMapping?.subTag, sectorMapping?.keywords);

    setForm(prev => {
      const next = { ...prev };
      for (const { key, aiKey } of fieldMap) {
        const aiVal = aiExtracted[aiKey];
        if (!aiVal) continue;
        const userVal = prev[key];
        const touched = userTouched.has(key);
        if (!touched && (!userVal || userVal === "" || (Array.isArray(userVal) && userVal.length === 0))) {
          // Convert AI string to array for targetCustomer and businessModel
          if ((key === "targetCustomer" || key === "businessModel") && typeof aiVal === "string") {
            (next as any)[key] = [aiVal];
          } else {
            (next as any)[key] = typeof aiVal === "string" ? aiVal : aiVal;
          }
          updatedFields.add(key);
        } else if (touched && userVal && String(userVal) !== String(aiVal)) {
          newSuggestions[key] = String(aiVal);
        }
      }
      if (normalized.sector) {
        if (!userTouched.has("sector") && (!prev.sector || prev.sector === "")) {
          next.sector = normalized.sector;
          updatedFields.add("sector");
        } else if (userTouched.has("sector") && prev.sector !== normalized.sector) {
          newSuggestions.sector = normalized.sector;
        }
      }
      if (normalized.subsectors.length > 0) {
        const deduped: string[] = [];
        const seenLower = new Set<string>();
        for (const sub of normalized.subsectors) {
          let canonical = sub;
          if (normalized.sector) {
            const match = subsectorsFor(normalized.sector).find(s => s.toLowerCase() === sub.toLowerCase());
            if (match) canonical = match;
          }
          const lower = canonical.toLowerCase();
          if (!seenLower.has(lower)) { seenLower.add(lower); deduped.push(canonical); }
        }
        if (!userTouched.has("sector") && prev.subsectors.length === 0) {
          next.subsectors = deduped.slice(0, 3);
          updatedFields.add("subsectors");
        }
        const userSubsLower = new Set(prev.subsectors.map(s => s.toLowerCase()));
        const newSubs = deduped.filter(s => !userSubsLower.has(s.toLowerCase()));
        setAiSuggestedSubsectors(newSubs.slice(0, 3));
        setAiOverflowSubsectors(newSubs.slice(3));
      } else {
        setAiSuggestedSubsectors([]);
        setAiOverflowSubsectors([]);
      }
      if (aiExtracted.competitors?.length) {
        if (!userTouched.has("competitors") && (!prev.competitors || prev.competitors.length === 0)) {
          next.competitors = aiExtracted.competitors;
          updatedFields.add("competitors");
        }
        setAiCompetitors(aiExtracted.competitors);
        try { localStorage.setItem("company-ai-competitors", JSON.stringify(aiExtracted.competitors)); } catch {}
      }
      return next;
    });
    setAiSuggestions(newSuggestions);
    setAiUpdatedFields(updatedFields);
    // Reset section confirmations on new analysis
    setSectionConfirmed({});
  };

  // Apply structured metrics (burnRate, cac, ltv) from analysis result
  const applyMetricsFromResult = (metrics: AnalysisResult["metrics"]) => {
    if (!metrics) return;
    setForm(prev => {
      const next = { ...prev };
      if (metrics.burnRate?.value && !userTouched.has("burnRate") && !prev.burnRate) {
        next.burnRate = metrics.burnRate.value;
        setAiUpdatedFields(f => new Set(f).add("burnRate"));
      }
      if (metrics.cac?.value && !userTouched.has("cac") && !prev.cac) {
        next.cac = metrics.cac.value;
        setAiUpdatedFields(f => new Set(f).add("cac"));
      }
      if (metrics.ltv?.value && !userTouched.has("ltv") && !prev.ltv) {
        next.ltv = metrics.ltv.value;
        setAiUpdatedFields(f => new Set(f).add("ltv"));
      }
      return next;
    });
  };

  const handleReclassify = async () => {
    const execSummary = (() => { try { return JSON.parse(localStorage.getItem("company-analysis") || "{}").executiveSummary || ""; } catch { return ""; } })();
    if (!websiteMarkdown && !execSummary) return;
    setIsReclassifying(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("classify-sector", {
        body: { websiteText: websiteMarkdown, executiveSummary: execSummary, companyName: form.name },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const classification = data as SectorClassification;
      setSectorClassification(classification);
      onSectorChange?.(classification);
      if (classification.primary_sector) {
        const normalized = normalizeSector(classification.primary_sector);
        if (normalized.sector && !userTouched.has("sector")) {
          setForm(prev => ({ ...prev, sector: normalized.sector }));
        }
      }
      if (classification.modern_tags?.length) {
        const resolvedSector = form.sector || (classification.primary_sector ? normalizeSector(classification.primary_sector).sector : "");
        const canonicalTags: string[] = [];
        const seenLower = new Set<string>();
        for (const tag of classification.modern_tags) {
          let canonical = tag;
          if (resolvedSector) {
            const match = subsectorsFor(resolvedSector).find(s => s.toLowerCase() === tag.toLowerCase());
            if (match) canonical = match;
          }
          if (canonical === tag) {
            for (const s of sectors) {
              const match = subsectorsFor(s).find(sub => sub.toLowerCase() === tag.toLowerCase() || sub.toLowerCase().includes(tag.toLowerCase()));
              if (match) { canonical = match; break; }
            }
          }
          const lower = canonical.toLowerCase();
          if (!seenLower.has(lower)) { seenLower.add(lower); canonicalTags.push(canonical); }
        }
        const userSubsLower = new Set(form.subsectors.map(s => s.toLowerCase()));
        const newTags = canonicalTags.filter(t => !userSubsLower.has(t.toLowerCase()));
        setAiSuggestedSubsectors(newTags.slice(0, 3));
        setAiOverflowSubsectors(newTags.slice(3));
        if (form.subsectors.length === 0 && !userTouched.has("sector")) {
          setForm(prev => ({ ...prev, subsectors: newTags.slice(0, 3) }));
        }
      }
    } catch (e) {
      console.error("Re-classification failed:", e);
    } finally { setIsReclassifying(false); }
  };

  const handleAnalyze = async () => {
    if (isEditing) { setError("Please finish editing fields before running analysis."); return; }
    if (!form.name.trim()) { setError("Company name is required."); return; }
    if (!form.website.trim() && !deckText) { setError("Provide a website URL or upload a pitch deck."); return; }

    setIsAnalyzing(true);
    setError(null);
    setHasNewInputs(false);
    let scrapedMarkdown = "";

    try {
      if (deckText) { setAnalyzeStep("scraping"); await new Promise(r => setTimeout(r, 800)); }
      if (form.website.trim()) {
        setAnalyzeStep("analyzing");
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("scrape-website", { body: { url: form.website.trim() } });
        if (!scrapeError && scrapeData?.markdown) { scrapedMarkdown = scrapeData.markdown; setWebsiteMarkdown(scrapedMarkdown); }
      }

      setAnalyzeStep("deepSearch");
      let deepSearchInvestors: any[] = [];
      try {
        const { data: exaData, error: exaError } = await supabase.functions.invoke("exa-search", { body: { companyName: form.name, subsector: form.sector || "" } });
        if (!exaError && exaData?.investors?.length > 0) {
          deepSearchInvestors = exaData.investors.map((inv: any) => ({
            investorName: inv.investorName, entityType: inv.entityType || "VC Firm", instrument: inv.instrument || "Equity",
            amount: inv.amount || 0, date: inv.date || "", source: "exa" as const,
            highlight: inv.highlight || "", sourceUrl: inv.sourceUrl || "", domain: inv.domain || "",
          }));
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existingAnalysis } = await supabase.from("company_analyses").select("id").eq("user_id", user.id).limit(1).maybeSingle();
          const companyDomain = form.website.trim() ? form.website.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
          const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-investor-data", {
            body: { company_id: existingAnalysis?.id || crypto.randomUUID(), company_domain: companyDomain, user_id: user.id, company_name: form.name },
          });
          if (!syncError && syncData?.newInvestorsFound > 0) {
            const { data: pendingRows } = await supabase.from("pending_investors").select("investor_name, entity_type, instrument, amount, source_date").eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(syncData.newInvestorsFound);
            const webInvestors = (pendingRows || []).map((p: any) => ({ investorName: p.investor_name, entityType: p.entity_type, instrument: p.instrument, amount: p.amount || 0, date: p.source_date || "", source: "web" as const }));
            const exaNames = new Set(deepSearchInvestors.map((i: any) => i.investorName.toLowerCase().trim()));
            for (const wi of webInvestors) { if (!exaNames.has(wi.investorName.toLowerCase().trim())) deepSearchInvestors.push(wi); }
          }
        }
      } catch (deepErr) { console.warn("Deep search failed (non-blocking):", deepErr); }

      setAnalyzeStep("verifying");
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-company", {
        body: { websiteText: scrapedMarkdown, deckText, companyName: form.name, stage: form.stage, sector: form.sector },
      });
      if (analysisError) throw new Error(analysisError.message || "Analysis failed");
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalyzeStep("mapping");
      applyAiData(analysisData.aiExtracted, analysisData.sectorMapping);
      applyMetricsFromResult(analysisData.metrics);

      const verification: Record<string, { sources: string[]; status: string; conflictDetail?: string }> = {};
      const fieldKeys = ["hqLocation", "stage", "sector", "currentARR", "yoyGrowth", "totalHeadcount", "businessModel", "targetCustomer", "uniqueValueProp", "competitors"];
      for (const field of fieldKeys) {
        const sources: string[] = [];
        const aiVal = analysisData.aiExtracted?.[field];
        if (deckText && aiVal) sources.push("deck");
        if (scrapedMarkdown && aiVal) sources.push("website");
        if (aiVal) sources.push("realtime");
        if (sources.length >= 3) verification[field] = { sources, status: "verified" };
        else if (sources.length === 1 && sources[0] === "deck") verification[field] = { sources, status: "deck-only" };
        else if (sources.length >= 1) verification[field] = { sources, status: "predictive" };
      }
      setSourceVerification(verification);

      if (analysisData.stageClassification) {
        setStageClassification(analysisData.stageClassification);
        onStageClassification?.(analysisData.stageClassification);
        if (!userTouched.has("stage") && analysisData.stageClassification.detected_stage) {
          setForm(prev => ({ ...prev, stage: analysisData.stageClassification.detected_stage }));
        }
      }

      setScanningMetrics(false);
      setAnalysisComplete(true);
      const analyzedInputs = { url: form.website, hasDeck: !!deckText };
      setLastAnalyzedInputs(analyzedInputs);
      try { localStorage.setItem("company-last-analyzed-inputs", JSON.stringify(analyzedInputs)); } catch {}
      setMetricsUnlocked(true);
      setOriginalFormSnapshot(null);
      setDataSource("ai");
      // Reset section confirmations and field edit tracking, enter review mode
      setSectionConfirmed({});
      setFieldsEditedSinceAnalysis(false);
      enterReviewMode("overview");

      const deckInvestors = analysisData.extractedInvestors || [];
      const seenNames = new Set(deckInvestors.map((i: any) => i.investorName?.toLowerCase().trim()));
      const mergedInvestors = [...deckInvestors, ...deepSearchInvestors.filter((i: any) => !seenNames.has(i.investorName?.toLowerCase().trim()))];
      const finalResult = { ...analysisData, extractedInvestors: mergedInvestors, sourceVerification: verification };
      onAnalysis?.(finalResult as AnalysisResult);
      try { localStorage.setItem("company-analysis", JSON.stringify(finalResult)); } catch {}
      onWalkthroughComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStep("");
    }
  };

  const isFieldAiDraft = (field: keyof CompanyData) => !confirmed && !userTouched.has(field) && !!form[field];

  const inputCls = (field: keyof CompanyData) =>
    `w-full rounded-lg border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all duration-200 ${
      isFieldAiDraft(field) ? "border-accent/20 bg-accent/5" : "border-input bg-background"
    } ${emptyFieldPulseClass(field)}`;

  const selectCls = (field: keyof CompanyData) =>
    `w-full rounded-lg border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all duration-200 appearance-none ${
      isFieldAiDraft(field) ? "border-accent/20 bg-accent/5" : "border-input bg-background"
    }`;

  const isEditableElement = (element: Element | null): boolean => {
    if (!element) return false;
    const editableSelector = "input, textarea, select, [contenteditable='true']";
    return element.matches(editableSelector) || !!element.closest(editableSelector);
  };

  const handleOutputFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    if (isEditableElement(event.target as Element)) setIsEditing(true);
  };

  const handleOutputBlurCapture = () => {
    requestAnimationFrame(() => {
      const container = outputSectionsRef.current;
      const activeElement = document.activeElement;
      const stillEditing = !!container && container.contains(activeElement) && isEditableElement(activeElement);
      setIsEditing(stillEditing);
    });
  };

  const canAnalyze = Boolean(form.name.trim() && (form.website.trim() || deckText) && !isEditing);

  useImperativeHandle(ref, () => ({
    triggerAnalysis: handleAnalyzeClick,
    isAnalyzing,
    canAnalyze,
    analyzeStepLabel: isAnalyzing ? (STEP_LABELS[analyzeStep] || "Analyzing...") : "Run Analysis",
  }), [handleAnalyzeClick, isAnalyzing, canAnalyze, analyzeStep]);

  // Badge renderer for right column fields
  const renderFieldBadge = (field: keyof CompanyData) => {
    if (!form[field] || (Array.isArray(form[field]) && (form[field] as string[]).length === 0)) return null;
    if (!analysisComplete && !userTouched.has(field)) return null;
    const isAi = !userTouched.has(field) && aiUpdatedFields.has(field);
    const isEdited = userTouched.has(field);
    if (isAi) return <FieldBadge isAi={true} />;
    if (isEdited) return <FieldBadge isAi={false} />;
    if (isFieldAiDraft(field)) return <FieldBadge isAi={true} />;
    return null;
  };

  // Period toggle handler with auto-conversion (revenue & burn only, growth fields are independent)
  const handlePeriodToggle = (period: "monthly" | "annual") => {
    if (period === metricPeriod) return;
    setMetricPeriod(period);
    // Auto-convert revenue
    if (form.currentARR) {
      const converted = period === "annual" ? mrrToArr(form.currentARR) : arrToMrr(form.currentARR);
      if (converted) setForm(f => ({ ...f, currentARR: converted }));
    }
    // Auto-convert burn rate
    if (form.burnRate) {
      const n = parseSmartNumber(form.burnRate);
      if (n) {
        const converted = period === "annual" ? formatWithCommas(n * 12) : formatWithCommas(Math.round(n / 12));
        setForm(f => ({ ...f, burnRate: converted }));
      }
    }
  };

  // LTV/CAC ratio: manual override or auto-calculated
  const [ltvCacOverride, setLtvCacOverride] = useState("");
  const autoLtvCacRatio = (() => {
    const ltv = parseSmartNumber(form.ltv);
    const cac = parseSmartNumber(form.cac);
    if (ltv && cac) return (ltv / cac).toFixed(1) + "x";
    return "";
  })();
  const ltvCacRatio = ltvCacOverride || autoLtvCacRatio || "—";

  // Section confirmation helpers
  // Overview required fields for strict validation
  const OVERVIEW_REQUIRED_FIELDS = ["stage", "sector", "businessModel", "targetCustomer", "hqLocation"] as const;

  const getOverviewMissingFields = (): string[] => {
    const missing: string[] = [];
    if (!logoUrl) missing.push("logo");
    for (const f of OVERVIEW_REQUIRED_FIELDS) {
      const v = form[f];
      if (!v || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "")) {
        missing.push(f);
      }
    }
    return missing;
  };

  const isOverviewComplete = () => getOverviewMissingFields().length === 0;

  const confirmSection = (section: string) => {
    // Strict validation for overview
    if (section === "overview") {
      const missing = getOverviewMissingFields();
      if (missing.length > 0) {
        const fieldLabels: Record<string, string> = {
          logo: "Company Logo", stage: "Stage", sector: "Sector",
          businessModel: "Business Model", targetCustomer: "Target Customer", hqLocation: "HQ Location",
        };
        const missingNames = missing.map(f => fieldLabels[f] || f).join(", ");
        setOverviewValidationErrors(new Set(missing));
        setOverviewApproveLabel("Missing Required Fields");
        toast({ title: "Cannot approve", description: `Missing: ${missingNames}`, variant: "destructive" });

        // Pulse for 2s, then settle
        if (validationPulseTimerRef.current) clearTimeout(validationPulseTimerRef.current);
        validationPulseTimerRef.current = setTimeout(() => {
          setOverviewValidationErrors(new Set());
          setOverviewApproveLabel(null);
        }, 2000);
        return; // Do NOT approve
      }
    }

    setSectionConfirmed(prev => ({ ...prev, [section]: true }));
    setOpenSections(prev => ({ ...prev, [section]: false }));
    toast({ title: `${section} confirmed`, description: "Section verified and saved." });

    // Auto-advance to next section in review mode
    if (isInReviewMode) {
      const currentIdx = REVIEW_ORDER.indexOf(section as typeof REVIEW_ORDER[number]);
      const nextSection = REVIEW_ORDER[currentIdx + 1];
      if (nextSection) {
        setTimeout(() => {
          setActiveReviewSection(nextSection);
          setOpenSections(prev => ({ ...prev, [nextSection]: true }));
        }, 200);
      } else {
        // All sections reviewed — exit review mode
        setActiveReviewSection(null);
      }
    }
  };

  // Enter review mode: collapse all except the target section
  const enterReviewMode = (startSection: string) => {
    setActiveReviewSection(startSection);
    const newOpen: Record<string, boolean> = {};
    REVIEW_ORDER.forEach(s => { newOpen[s] = s === startSection; });
    setOpenSections(newOpen);
  };

  // Manual accordion toggle exits strict review mode
  const handleManualToggle = (section: string, value: boolean) => {
    if (isInReviewMode) setActiveReviewSection(null);
    setOpenSections(prev => ({ ...prev, [section]: value }));
  };
  const allSectionsConfirmed = sectionConfirmed.overview && sectionConfirmed.positioning && sectionConfirmed.metrics && sectionConfirmed.social;

  // Section fields for emptiness check
  const sectionFields: Record<string, (keyof CompanyData)[]> = {
    overview: ["stage", "sector", "businessModel", "targetCustomer", "hqLocation"],
    positioning: ["uniqueValueProp", "competitors"],
    metrics: ["currentARR", "yoyGrowth", "totalHeadcount", "burnRate", "cac", "ltv", "nrr"],
    social: ["socialTwitter", "socialLinkedin", "socialInstagram"],
  };

  const isSectionEmpty = (section: string) => {
    const fields = sectionFields[section] || [];
    return fields.every(f => {
      const v = form[f];
      return !v || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
    });
  };

  // 3-state status dot logic
  // Overview uses strict validation: grey (missing required), amber (data present, unapproved), green (approved + complete)
  // Other sections: red (empty), yellow (needs review), green (approved)
  const renderStatusDot = (section: string) => {
    if (section === "overview") {
      const complete = isOverviewComplete();
      if (sectionConfirmed[section] && complete) {
        // Approved + all filled: static green
        return <span className="inline-flex rounded-full h-2 w-2 bg-success" />;
      }
      if (!complete) {
        // Missing required fields: static grey
        return <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/30" />;
      }
      // All fields filled but not approved: pulsing amber
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
        </span>
      );
    }

    // Other sections keep existing logic
    if (isSectionEmpty(section)) {
      return <span className="inline-flex rounded-full h-2 w-2 bg-destructive/40" />;
    }
    if (sectionConfirmed[section]) {
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
      );
    }
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
      </span>
    );
  };

  // Guided walkthrough: find first section with empty/unapproved fields, open it, scroll, pulse
  const triggerWalkthrough = useCallback(() => {
    const targetSection = REVIEW_ORDER.find(s => !sectionConfirmed[s] || isSectionEmpty(s))
      || REVIEW_ORDER.find(s => !sectionConfirmed[s]);
    if (!targetSection) return;

    const newOpen: Record<string, boolean> = {};
    for (const s of REVIEW_ORDER) newOpen[s] = s === targetSection;
    setOpenSections(newOpen);
    setWalkthroughActive(true);

    requestAnimationFrame(() => {
      setTimeout(() => {
        sectionRefs.current[targetSection]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    });

    if (walkthroughTimerRef.current) clearTimeout(walkthroughTimerRef.current);
    walkthroughTimerRef.current = setTimeout(() => setWalkthroughActive(false), 3000);
  }, [sectionConfirmed, form]);

  // Helper: CSS class for empty inputs during walkthrough OR validation errors
  const emptyFieldPulseClass = (field: keyof CompanyData) => {
    // Validation error pulse (overview approve failed)
    if (overviewValidationErrors.has(field)) {
      return "ring-2 ring-red-400 ring-offset-1 animate-pulse";
    }
    if (!walkthroughActive) return "";
    const v = form[field];
    const isEmpty = !v || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
    return isEmpty ? "ring-2 ring-primary/60 ring-offset-1 animate-pulse" : "";
  };

  // Helper: CSS class for logo avatar validation error
  const logoValidationClass = overviewValidationErrors.has("logo")
    ? "ring-2 ring-red-400 ring-offset-1 animate-pulse"
    : "";

  // Dynamic tier logic
  const getProgressTier = (percent: number) => {
    if (percent >= 90) return {
      stroke: "hsl(var(--success))",
      ringClass: "drop-shadow-[0_0_8px_hsl(var(--success)/0.5)]",
      title: "Ready for launch.",
      subtitle: "Your profile is looking great. Finish the last details to finalize your data room.",
      btnVariant: "solid" as const,
    };
    if (percent >= 50) return {
      stroke: "hsl(38 92% 50%)",
      ringClass: "drop-shadow-[0_0_8px_hsl(38_92%_50%/0.5)]",
      title: "You're almost there.",
      subtitle: "Just a few more fields to unlock highly accurate investor matches.",
      btnVariant: "outline" as const,
    };
    return {
      stroke: "hsl(var(--destructive))",
      ringClass: "drop-shadow-[0_0_8px_hsl(var(--destructive)/0.5)]",
      title: "Let's build your foundation.",
      subtitle: "Complete your core metrics to start generating AI insights.",
      btnVariant: "outline" as const,
    };
  };

  const tier = getProgressTier(completion);

  // Animated counter hook
  const useAnimatedNumber = (target: number) => {
    const [display, setDisplay] = useState(target);
    const rafRef = useRef<number>();
    useEffect(() => {
      const start = display;
      const diff = target - start;
      if (diff === 0) return;
      const duration = 600;
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(start + diff * eased));
        if (progress < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [target]);
    return display;
  };

  const animatedCompletion = useAnimatedNumber(completion);

  // Circular progress ring
  const CircularProgress = ({ percent }: { percent: number }) => {
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    return (
      <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
        <circle cx="36" cy="36" r={radius} fill="none" stroke={tier.stroke} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 36 36)" className={`transition-all duration-700 ease-out animate-pulse ${tier.ringClass}`} />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          className="fill-foreground text-[14px] font-bold">{animatedCompletion}%</text>
      </svg>
    );
  };

  const handleConfirmProfile = () => {
    setConfirmed(true);
    try { localStorage.setItem("company-profile-verified", "true"); } catch {}
    onProfileVerified?.(true);
    toast({ title: "✅ Profile Verified", description: "Your company profile has been confirmed." });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* ═══════════════════════════════════════════════
          LEFT COLUMN: DATA SOURCES (col-span-4) — sticky
          ═══════════════════════════════════════════════ */}
      <div className="lg:col-span-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h3>
        <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5 lg:sticky lg:top-6 transition-opacity duration-300 ${isAnalyzing ? "opacity-70 pointer-events-none" : ""}`}>

          {/* COMPANY NAME */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Company Name *</label>
            <input type="text" value={form.name} onChange={e => update("name", e.target.value)}
              placeholder="Acme Corp" maxLength={100} disabled={isAnalyzing} className={inputCls("name")} />
          </div>


          {/* WEBSITE URL */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Website URL</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                {faviconUrl && faviconLoaded ? (
                  <img src={faviconUrl} alt="" className="h-4 w-4 rounded-sm object-contain" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <input type="url" value={form.website} disabled={isAnalyzing}
                onChange={e => {
                  const url = e.target.value;
                  update("website", url);
                  if (analysisComplete) setHasNewInputs(true);
                  if (faviconDebounceRef.current) clearTimeout(faviconDebounceRef.current);
                  faviconDebounceRef.current = setTimeout(() => {
                    const domain = extractDomain(url);
                    if (domain) {
                      const fav = faviconSrc(domain);
                      setFaviconUrl(fav); setFaviconLoaded(false);
                      const img = new Image();
                      img.onload = () => setFaviconLoaded(true);
                      img.onerror = () => { setFaviconUrl(null); setFaviconLoaded(false); };
                      img.src = fav;
                      if (!form.name.trim() && !userTouched.has("name")) {
                        const cleaned = cleanDomainToName(domain);
                        if (cleaned) setForm(prev => ({ ...prev, name: cleaned }));
                      }
                    } else { setFaviconUrl(null); setFaviconLoaded(false); }
                  }, 300);
                }}
                onBlur={() => {
                  const domain = extractDomain(form.website);
                  if (!domain) return;
                  // Auto-fetch logo on blur
                  const hdLogoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                  const testImg = new Image();
                  testImg.onload = () => {
                    if (logoUrl !== hdLogoUrl) setSuggestedLogoUrl(hdLogoUrl);
                  };
                  testImg.onerror = () => {};
                  testImg.src = hdLogoUrl;
                }}
                placeholder="https://acme.com" maxLength={255}
                className={`${inputCls("website")} pl-10`}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">We'll scrape your site for value prop & pricing</p>
            {/* Logo suggestion banner */}
            {suggestedLogoUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 mt-1 animate-fade-in">
                <img src={suggestedLogoUrl} alt="Suggested logo" className="h-8 w-8 rounded-lg border border-border object-contain bg-background" />
                <p className="text-[11px] text-muted-foreground flex-1">Use this as your company logo?</p>
                <button
                  onClick={() => {
                    setLogoUrl(suggestedLogoUrl);
                    try { localStorage.setItem("company-logo-url", suggestedLogoUrl); } catch {}
                    setSuggestedLogoUrl(null);
                    setLogoSyncBadge(true);
                    setTimeout(() => setLogoSyncBadge(false), 3000);
                  }}
                  className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => setSuggestedLogoUrl(null)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* PITCH DECK */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Pitch Deck (PDF)
            </label>
            <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
                scanningMetrics ? "border-accent/60 bg-accent/5" : "border-border bg-muted/30 hover:border-accent/40"
              }`}>
              {scanningMetrics ? (
                <Loader2 className="h-5 w-5 text-accent animate-spin mb-2" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground mb-2" />
              )}
              <span className={`text-sm text-center ${scanningMetrics ? "text-accent font-medium" : "text-muted-foreground"}`}>
                {scanningMetrics ? "Analyzing Deck..." : deckFile ? deckFile.name : "Drop PDF here or browse"}
              </span>
              {deckFile && deckText && !scanningMetrics && <span className="text-[10px] text-success font-mono mt-1">✓ Extracted</span>}
              <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              <button onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/80 mt-2">Browse</button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          {/* Smart Analysis Button */}
          {(() => {
            const isUpToDate = analysisComplete && !dataSourcesChanged;
            const isDisabled = isUpToDate || !canAnalyze || isAnalyzing;
            return (
              <>
                <button onClick={handleAnalyzeClick} disabled={isDisabled}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-[13px] font-medium transition-colors ${
                    isAnalyzing ? "bg-accent text-accent-foreground"
                    : isUpToDate ? "bg-muted text-muted-foreground cursor-default"
                    : "bg-accent text-accent-foreground hover:bg-accent/90"
                  } disabled:cursor-not-allowed`}>
                  {isAnalyzing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...</>
                  ) : isUpToDate ? (
                    <><Check className="h-3.5 w-3.5" /> Analysis Up to Date</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5" /> {analysisComplete ? "Run New Analysis" : "Run AI Analysis"}</>
                  )}
                </button>
                <p className="text-[10px] text-muted-foreground text-center">Triple-source triangulation: Deck + Website + Deep Search</p>
              </>
            );
          })()}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          RIGHT COLUMN: GENERATED PROFILE (col-span-8) — scrollable
          ═══════════════════════════════════════════════ */}
      <div className="lg:col-span-8 space-y-3" ref={outputSectionsRef} onFocusCapture={handleOutputFocusCapture} onBlurCapture={handleOutputBlurCapture}>

        {/* Right column header: Generated Profile + autosave + progress */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Generated Profile</h3>
          <div className="flex items-center gap-4">
            {/* Completion progress */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${completion}%`,
                    background: completion >= 80 ? 'hsl(var(--success))' : completion >= 40 ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{completion}%</span>
            </div>
            {/* Autosave indicator — always visible when form has a name */}
            {form.name && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Auto-saving
              </span>
            )}
          </div>
        </div>

        {/* Analysis Terminal (during analysis) */}
        {isAnalyzing && (
          <div className="flex items-center justify-center py-12 animate-in fade-in duration-500">
            <div className="w-full max-w-lg rounded-2xl border border-accent/30 overflow-hidden"
              style={{ background: "linear-gradient(145deg, hsl(222 47% 8%), hsl(222 47% 12%))" }}>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-accent/15">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex items-center justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span className="font-mono text-[11px] text-accent font-medium tracking-wider">ANALYSIS ENGINE</span>
                </div>
              </div>
              <div className="px-5 py-5 space-y-3">
                <div className="font-mono text-[11px] leading-loose space-y-2" style={{ color: "rgba(226, 232, 240, 0.75)" }}>
                  {analyzeStep === "scraping" && <div className="flex gap-2 animate-in fade-in"><span className="text-purple-400 font-semibold">[PDF]</span><span>Parsing Deck Structure...</span><Loader2 className="h-3 w-3 animate-spin text-purple-400 ml-auto mt-0.5" /></div>}
                  {(analyzeStep === "analyzing" || analyzeStep === "deepSearch" || analyzeStep === "verifying" || analyzeStep === "mapping") && (
                    <><div className="flex gap-2 opacity-50"><span className="text-purple-400 font-semibold">[PDF]</span> Deck layers extracted ✓</div>
                    <div className="flex gap-2 animate-in fade-in"><span className="text-cyan-400 font-semibold">[WEB]</span><span>Scraping website content...</span>{analyzeStep === "analyzing" && <Loader2 className="h-3 w-3 animate-spin text-cyan-400 ml-auto mt-0.5" />}</div></>
                  )}
                  {(analyzeStep === "deepSearch" || analyzeStep === "verifying" || analyzeStep === "mapping") && (
                    <><div className="flex gap-2 opacity-50"><span className="text-cyan-400 font-semibold">[WEB]</span> Website scraped ✓</div>
                    <div className="flex gap-2 animate-in fade-in"><span className="text-yellow-400 font-semibold">[SEARCH]</span><span>Cross-referencing filings...</span>{analyzeStep === "deepSearch" && <Loader2 className="h-3 w-3 animate-spin text-yellow-400 ml-auto mt-0.5" />}</div></>
                  )}
                  {(analyzeStep === "verifying" || analyzeStep === "mapping") && (
                    <><div className="flex gap-2 opacity-50"><span className="text-yellow-400 font-semibold">[SEARCH]</span> Data captured ✓</div>
                    <div className="flex gap-2 animate-in fade-in"><span className="text-emerald-400 font-semibold">[AI]</span><span>Mapping sectors & landscape...</span>{analyzeStep === "verifying" && <Loader2 className="h-3 w-3 animate-spin text-emerald-400 ml-auto mt-0.5" />}</div></>
                  )}
                  {analyzeStep === "mapping" && (
                    <><div className="flex gap-2 opacity-50"><span className="text-emerald-400 font-semibold">[AI]</span> Sectors mapped ✓</div>
                    <div className="flex gap-2 animate-in fade-in"><span className="text-orange-400 font-semibold">[MAP]</span><span>Mapping competitive landscape...</span><Loader2 className="h-3 w-3 animate-spin text-orange-400 ml-auto mt-0.5" /></div></>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-accent/15 flex items-center justify-between">
                <span className="font-mono text-[9px] text-accent/40">Triple-source triangulation active</span>
                <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /><span className="font-mono text-[9px] text-accent/60">LIVE</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Pre-analysis placeholder */}
        {!analysisComplete && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card py-16">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Run analysis to auto-populate your company profile</span>
          </div>
        )}

        {/* ═══ Cards only shown after analysis or when data exists ═══ */}
        {(analysisComplete || form.hqLocation || form.sector) && !isAnalyzing && (
          <>
            {/* ─── CARD 1: Company Overview (Firmographics) ─── */}
            <Collapsible open={openSections.overview} onOpenChange={v => handleManualToggle("overview", v)}>
              <div ref={el => { sectionRefs.current.overview = el; }} className={`rounded-2xl border bg-card shadow-sm transition-all duration-300 ${isInReviewMode && activeReviewSection === "overview" ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-6 text-left">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <PhosphorBriefcase className="h-3.5 w-3.5 text-accent" /> Company Overview
                      {renderStatusDot("overview")}
                    </h3>
                    <div className="flex items-center gap-2">
                      {analysisComplete && (aiUpdatedFields.has("stage") || aiUpdatedFields.has("sector") || aiUpdatedFields.has("businessModel") || aiUpdatedFields.has("targetCustomer") || aiUpdatedFields.has("hqLocation")) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-[9px] font-semibold text-accent">
                          <PhosphorSparkle className="h-2.5 w-2.5" /> AI Categorized
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.overview ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 space-y-4">
                    {/* Company Logo */}
                    <div className="space-y-1">
                      <label className="text-xs uppercase text-muted-foreground font-semibold">Company Logo</label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/30 overflow-hidden transition-all hover:border-accent/40 ${logoValidationClass}`}
                        >
                          {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="h-full w-full object-cover rounded-full" />
                          ) : uploadingLogo ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Camera className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <span className="text-[11px] text-muted-foreground">{logoUrl ? "Click to change" : "Upload a logo"}</span>
                      </div>
                    </div>

                    {/* Row 1: Stage | Sector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2">
                          Stage {renderFieldBadge("stage")}
                        </label>
                        <TaxonomyCombobox
                          options={STAGE_OPTIONS}
                          value={form.stage}
                          onChange={v => update("stage", v)}
                          placeholder="Search stage..."
                          allowCustom={false}
                          isAiDraft={isFieldAiDraft("stage")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2">
                          Sector {renderFieldBadge("sector")}
                        </label>
                        <TaxonomyCombobox
                          options={SECTOR_OPTIONS}
                          value={form.sector}
                          onChange={(v, opt) => {
                            const oldSector = form.sector;
                            update("sector", v);
                            if (opt && "default_subsectors" in opt) {
                              const sectorOpt = opt as SectorOption;
                              setForm(prev => {
                                const validSubs = prev.subsectors.filter(sub =>
                                  sectorOpt.default_subsectors.some(canonical => canonical.toLowerCase() === sub.toLowerCase())
                                );
                                if (validSubs.length < prev.subsectors.length && oldSector) {
                                  toast({ title: "Subsectors cleared", description: "Subsectors cleared to match new Primary Sector." });
                                }
                                return { ...prev, subsectors: validSubs };
                              });
                            }
                          }}
                          placeholder="Search sectors..."
                          isAiDraft={isFieldAiDraft("sector")}
                        />
                      </div>
                    </div>

                    {/* Subsectors (full width) */}
                    {form.sector && (
                      <SectorSubsectorPicker
                        sector={form.sector}
                        subsectors={form.subsectors}
                        onSectorChange={s => {
                          const oldSector = form.sector;
                          update("sector", s);
                          setForm(prev => {
                            const validSubs = prev.subsectors.filter(sub =>
                              subsectorsFor(s).some(canonical => canonical.toLowerCase() === sub.toLowerCase())
                            );
                            if (validSubs.length < prev.subsectors.length && oldSector) {
                              toast({ title: "Subsectors cleared", description: "Subsectors cleared to match new Primary Sector." });
                            }
                            return { ...prev, subsectors: validSubs };
                          });
                        }}
                        onSubsectorsChange={subs => setForm(prev => ({ ...prev, subsectors: subs }))}
                        aiSuggestedSector={aiSuggestions.sector}
                        aiSuggestedSubsectors={aiSuggestedSubsectors}
                        aiOverflowSubsectors={aiOverflowSubsectors}
                        onApplyAiSector={aiSuggestions.sector ? () => {
                          update("sector", aiSuggestions.sector!);
                          if (aiSuggestedSubsectors.length) setForm(prev => ({ ...prev, subsectors: aiSuggestedSubsectors.slice(0, 3) }));
                        } : undefined}
                        isAiDraft={isFieldAiDraft("sector")}
                        onReclassify={analysisComplete ? handleReclassify : undefined}
                        isReclassifying={isReclassifying}
                        subsectorsOnly
                      />
                    )}

                    {/* Row 2: Business Model | Target Customer */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2">
                          Business Model {renderFieldBadge("businessModel")}
                        </label>
                        <div className="relative">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className={`w-full h-9 rounded-lg border bg-background px-3 text-left text-sm flex items-center gap-1.5 overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${form.businessModel.length ? 'border-input' : 'border-input text-muted-foreground'}`}>
                                {form.businessModel.length > 0 ? (
                                  <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
                                    {form.businessModel.slice(0, 3).map(bm => (
                                      <span key={bm} className="inline-flex items-center rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0 text-[11px] font-medium text-accent whitespace-nowrap">
                                        {bm}
                                      </span>
                                    ))}
                                    {form.businessModel.length > 3 && (
                                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">+{form.businessModel.length - 3}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span>Select model...</span>
                                )}
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-2" align="start">
                              <div className="space-y-1">
                                {BUSINESS_MODEL_OPTIONS.map(opt => {
                                  const selected = form.businessModel.includes(opt.label);
                                  return (
                                    <button key={opt.label} type="button"
                                      onClick={() => {
                                        if (selected) {
                                          update("businessModel", form.businessModel.filter(t => t !== opt.label));
                                        } else {
                                          update("businessModel", [...form.businessModel, opt.label]);
                                        }
                                      }}
                                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                                        selected ? "bg-accent/10 text-accent font-medium" : "text-foreground hover:bg-muted"
                                      }`}>
                                      {opt.label}
                                      {selected && <Check className="h-3 w-3 text-accent" />}
                                    </button>
                                  );
                                })}
                              </div>
                              {form.businessModel.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-border">
                                  <div className="flex flex-wrap gap-1">
                                    {form.businessModel.map(bm => (
                                      <span key={bm} className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                                        {bm}
                                        <button type="button" onClick={() => update("businessModel", form.businessModel.filter(t => t !== bm))} className="text-accent/60 hover:text-accent transition-colors">
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <button type="button" onClick={() => update("businessModel", [])}
                                    className="w-full mt-1.5 text-[11px] text-muted-foreground hover:text-destructive transition-colors py-1 text-center">
                                    Clear all
                                  </button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="space-y-1">
                         <label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2">
                          Target Customer {renderFieldBadge("targetCustomer")}
                        </label>
                        <div className="relative">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className={`w-full h-9 rounded-lg border bg-background px-3 text-left text-sm flex items-center gap-1.5 overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${form.targetCustomer.length ? 'border-input' : 'border-input text-muted-foreground'}`}>
                                {form.targetCustomer.length > 0 ? (
                                  <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
                                    {form.targetCustomer.slice(0, 3).map(tc => (
                                      <span key={tc} className="inline-flex items-center rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0 text-[11px] font-medium text-accent whitespace-nowrap">
                                        {tc}
                                      </span>
                                    ))}
                                    {form.targetCustomer.length > 3 && (
                                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">+{form.targetCustomer.length - 3}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span>Select markets...</span>
                                )}
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-2" align="start">
                              <div className="space-y-1">
                                {TARGET_CUSTOMER_OPTIONS.map(opt => {
                                  const selected = form.targetCustomer.includes(opt.label);
                                  return (
                                    <button key={opt.label} type="button"
                                      onClick={() => {
                                        if (selected) {
                                          update("targetCustomer", form.targetCustomer.filter(t => t !== opt.label));
                                        } else {
                                          update("targetCustomer", [...form.targetCustomer, opt.label]);
                                        }
                                      }}
                                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                                        selected ? "bg-accent/10 text-accent font-medium" : "text-foreground hover:bg-muted"
                                      }`}>
                                      {opt.label}
                                      {selected && <Check className="h-3 w-3 text-accent" />}
                                    </button>
                                  );
                                })}
                              </div>
                              {form.targetCustomer.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-border">
                                  <div className="flex flex-wrap gap-1">
                                    {form.targetCustomer.map(tc => (
                                      <span key={tc} className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                                        {tc}
                                        <button type="button" onClick={() => update("targetCustomer", form.targetCustomer.filter(t => t !== tc))} className="text-accent/60 hover:text-accent transition-colors">
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <button type="button" onClick={() => update("targetCustomer", [])}
                                    className="w-full mt-1.5 text-[11px] text-muted-foreground hover:text-destructive transition-colors py-1 text-center">
                                    Clear all
                                  </button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    {/* Row 3: HQ Location (full width) */}
                    <div className="space-y-1">
                      <label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-2">
                        HQ Location {renderFieldBadge("hqLocation")}
                      </label>
                      <LocationAutocomplete value={form.hqLocation} onChange={v => update("hqLocation", v)}
                        className={`h-9 ${inputCls("hqLocation")}`} />
                    </div>

              {/* Approve button */}
              {analysisComplete && !confirmed && (
                <div className="pt-2 border-t border-border/50 flex justify-end">
                  {sectionConfirmed.overview ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : (
                    <button onClick={() => confirmSection("overview")}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[11px] font-medium transition-colors ${
                        overviewApproveLabel
                          ? "border-destructive/30 bg-destructive/5 text-destructive cursor-not-allowed"
                          : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}>
                      {overviewApproveLabel ? (
                        <><AlertCircle className="h-3.5 w-3.5" /> {overviewApproveLabel}</>
                      ) : (
                        <><Check className="h-3.5 w-3.5" /> Approve Company Overview</>
                      )}
                    </button>
                  )}
                </div>
              )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* ─── CARD 2: Positioning & Links ─── */}
            <Collapsible open={openSections.positioning} onOpenChange={v => handleManualToggle("positioning", v)}>
              <div ref={el => { sectionRefs.current.positioning = el; }} className={`rounded-2xl border bg-card shadow-sm transition-all duration-300 ${isInReviewMode && activeReviewSection === "positioning" ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-6 text-left">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <PhosphorCrosshair className="h-3.5 w-3.5 text-accent" /> Positioning
                      {renderStatusDot("positioning")}
                    </h3>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.positioning ? 'rotate-180' : ''}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 space-y-5">

              {/* UVP */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Unique Value Proposition {renderFieldBadge("uniqueValueProp")}
                </label>
                <textarea value={form.uniqueValueProp} onChange={e => update("uniqueValueProp", e.target.value)}
                  placeholder="What makes your product uniquely defensible?"
                  rows={3} className={`${inputCls("uniqueValueProp")} min-h-[72px] resize-none`} />
              </div>

              {/* Competitors */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Direct Competitors {renderFieldBadge("competitors")}
                </label>
                <CompetitorTagInput
                  tags={form.competitors}
                  onChange={v => update("competitors", v)}
                  isAiDraft={isFieldAiDraft("competitors")}
                  aiTags={aiCompetitors}
                  onAiTagConfirm={(tag) => {
                    setAiCompetitors(prev => {
                      const next = prev.filter(t => t !== tag);
                      try { localStorage.setItem("company-ai-competitors", JSON.stringify(next)); } catch {}
                      return next;
                    });
                  }}
                />
              </div>

              {/* Approve button */}
              {analysisComplete && !confirmed && (
                <div className="pt-2 border-t border-border/50 flex justify-end">
                  {sectionConfirmed.positioning ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : (
                    <button onClick={() => confirmSection("positioning")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <Check className="h-3.5 w-3.5" /> Approve Section
                    </button>
                  )}
                </div>
              )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* ─── CARD 3: Health & Unit Economics ─── */}
            <Collapsible open={openSections.metrics} onOpenChange={v => handleManualToggle("metrics", v)}>
              <div ref={el => { sectionRefs.current.metrics = el; }} className={`rounded-2xl border bg-card shadow-sm transition-all duration-300 ${isInReviewMode && activeReviewSection === "metrics" ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-6 text-left">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <PhosphorChartLine className="h-3.5 w-3.5 text-accent" /> Metrics
                      {renderStatusDot("metrics")}
                    </h3>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.metrics ? 'rotate-180' : ''}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 space-y-5">

                    {/* Monthly / Annual toggle */}
                    <div className="flex justify-end">
                      <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
                        <button
                          onClick={() => handlePeriodToggle("monthly")}
                          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                            metricPeriod === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >Monthly</button>
                        <button
                          onClick={() => handlePeriodToggle("annual")}
                          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                            metricPeriod === "annual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >Annual</button>
                      </div>
                    </div>

              {/* ── Section 1: Topline ── */}
              <div className="grid grid-cols-3 gap-4">
                {/* Revenue (MRR/ARR) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    {metricPeriod === "annual" ? "ARR" : "MRR"} {renderFieldBadge("currentARR")}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input type="text" value={form.currentARR} onChange={e => update("currentARR", e.target.value.replace(/[^0-9.,mkbMKB]/g, ""))}
                      onBlur={e => {
                        const n = parseSmartNumber(e.target.value);
                        if (n) update("currentARR", formatWithCommas(n));
                      }}
                      placeholder={metricPeriod === "annual" ? "e.g. 14.4m" : "e.g. 1.2m"} className={`${inputCls("currentARR")} pl-9`} />
                  </div>
                </div>

                {/* Growth (MoM/YoY — independent fields) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    {metricPeriod === "annual" ? "YoY Growth" : "MoM Growth"} {renderFieldBadge(metricPeriod === "annual" ? "yoyGrowth" : "momGrowth")}
                  </label>
                  <div className="relative">
                    <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input type="text"
                      value={metricPeriod === "annual" ? form.yoyGrowth : form.momGrowth}
                      onChange={e => {
                        const field = metricPeriod === "annual" ? "yoyGrowth" : "momGrowth";
                        update(field, e.target.value.replace(/[^0-9.kmKM]/g, ""));
                      }}
                      onBlur={e => {
                        const n = parseSmartNumber(e.target.value);
                        const field = metricPeriod === "annual" ? "yoyGrowth" : "momGrowth";
                        if (n) update(field, formatWithCommas(Math.round(n)));
                      }}
                      placeholder={metricPeriod === "annual" ? "e.g. 150" : "e.g. 8"} className={`${inputCls("yoyGrowth")} pl-9 pr-8`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>

                {/* Burn Rate */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    {metricPeriod === "annual" ? "Annual Burn" : "Monthly Burn"} {renderFieldBadge("burnRate")}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input type="text" value={form.burnRate} onChange={e => update("burnRate", e.target.value.replace(/[^0-9.,mkbMKB]/g, ""))}
                      onBlur={e => {
                        const n = parseSmartNumber(e.target.value);
                        if (n) update("burnRate", formatWithCommas(n));
                      }}
                      placeholder={metricPeriod === "annual" ? "e.g. 600k" : "e.g. 50k"} className={`${inputCls("burnRate")} pl-9`} />
                  </div>
                </div>
              </div>

              {/* Divider with spacing */}
              <hr className="border-border/50 my-1" />

              {/* ── Section 2: Unit Economics ── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Unit Economics</label>
                <div className="grid grid-cols-3 gap-4">
                  {/* CAC */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      CAC {renderFieldBadge("cac")}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input type="text" value={form.cac} onChange={e => update("cac", e.target.value.replace(/[^0-9.,mkbMKB]/g, ""))}
                        onBlur={e => {
                          const n = parseSmartNumber(e.target.value);
                          if (n) update("cac", formatWithCommas(n));
                        }}
                        placeholder="e.g. 250" className={`${inputCls("cac")} pl-9`} />
                    </div>
                  </div>

                  {/* LTV */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      LTV {renderFieldBadge("ltv")}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input type="text" value={form.ltv} onChange={e => update("ltv", e.target.value.replace(/[^0-9.,mkbMKB]/g, ""))}
                        onBlur={e => {
                          const n = parseSmartNumber(e.target.value);
                          if (n) update("ltv", formatWithCommas(n));
                        }}
                        placeholder="e.g. 5,000" className={`${inputCls("ltv")} pl-9`} />
                    </div>
                  </div>

                  {/* LTV/CAC Ratio (manual override or auto-calculated) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">LTV / CAC Ratio</label>
                    <div className="relative">
                      <input type="text"
                        value={ltvCacOverride || autoLtvCacRatio}
                        onChange={e => setLtvCacOverride(e.target.value.replace(/[^0-9.:x]/g, ""))}
                        onBlur={e => {
                          const raw = e.target.value.trim().replace(/x$/i, "");
                          if (!raw) { setLtvCacOverride(""); return; }
                          const ratioMatch = raw.match(/^([\d.]+)\s*:\s*([\d.]+)$/);
                          if (ratioMatch) {
                            const num = parseFloat(ratioMatch[1]);
                            const den = parseFloat(ratioMatch[2]);
                            if (den > 0) { setLtvCacOverride((num / den).toFixed(1) + "x"); return; }
                          }
                          const num = parseFloat(raw);
                          if (!isNaN(num)) setLtvCacOverride(num % 1 === 0 ? num + "x" : num.toFixed(1) + "x");
                        }}
                        placeholder="Auto or e.g. 3.5x"
                        className={`w-full rounded-lg border border-border px-3 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring ${
                          ltvCacOverride ? "bg-background text-foreground" : "bg-accent/5 text-accent/80"
                        }`} />
                      {!ltvCacOverride && autoLtvCacRatio && (
                        <PhosphorSparkle className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent/50" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-border/50" />

              {/* ── Section 3: Health & Ops ── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Health & Ops</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* NRR */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      NRR {renderFieldBadge("nrr")}
                    </label>
                    <div className="relative">
                      <input type="text" value={form.nrr} onChange={e => update("nrr", e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="e.g. 110" className={`${inputCls("nrr")} pr-8`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* Headcount */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      Headcount {renderFieldBadge("totalHeadcount")}
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input type="text" value={form.totalHeadcount} onChange={e => update("totalHeadcount", e.target.value.replace(/[^0-9kmKM]/g, ""))}
                        onBlur={e => {
                          const n = parseSmartNumber(e.target.value);
                          if (n) update("totalHeadcount", formatWithCommas(n));
                        }}
                        placeholder="e.g. 25" className={`${inputCls("totalHeadcount")} pl-9`} />
                    </div>
                  </div>
                </div>
              </div>
              {/* Approve button */}
              {analysisComplete && !confirmed && (
                <div className="pt-2 border-t border-border/50 flex justify-end">
                  {sectionConfirmed.metrics ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                  ) : (
                    <button onClick={() => confirmSection("metrics")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <Check className="h-3.5 w-3.5" /> Approve Section
                    </button>
                  )}
                </div>
              )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* ─── CARD 4: Social Links ─── */}
            <Collapsible open={openSections.social} onOpenChange={v => handleManualToggle("social", v)}>
              <div ref={el => { sectionRefs.current.social = el; }} className={`rounded-2xl border bg-card shadow-sm transition-all duration-300 ${isInReviewMode && activeReviewSection === "social" ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-6 text-left">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <PhosphorShareNetwork className="h-3.5 w-3.5 text-accent" /> Social Links
                      {renderStatusDot("social")}
                    </h3>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.social ? 'rotate-180' : ''}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          X / Twitter {renderFieldBadge("socialTwitter")}
                        </label>
                        <div className="relative">
                          <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input type="url" value={form.socialTwitter} onChange={e => update("socialTwitter", e.target.value)}
                            placeholder="x.com/handle" className={`${inputCls("socialTwitter")} pl-9`} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          LinkedIn {renderFieldBadge("socialLinkedin")}
                        </label>
                        <div className="relative">
                          <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input type="url" value={form.socialLinkedin} onChange={e => update("socialLinkedin", e.target.value)}
                            placeholder="linkedin.com/company/..." className={`${inputCls("socialLinkedin")} pl-9`} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          Instagram {renderFieldBadge("socialInstagram")}
                        </label>
                        <div className="relative">
                          <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input type="url" value={form.socialInstagram} onChange={e => update("socialInstagram", e.target.value)}
                            placeholder="instagram.com/handle" className={`${inputCls("socialInstagram")} pl-9`} />
                        </div>
                      </div>
                    </div>

                    {/* Approve button */}
                    {analysisComplete && !confirmed && (
                      <div className="pt-3 border-t border-border/50 flex justify-end">
                        {sectionConfirmed.social ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</span>
                        ) : (
                          <button onClick={() => confirmSection("social")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                            <Check className="h-3.5 w-3.5" /> Approve Section
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* ─── Profile Completion Card ─── */}
            {analysisComplete && !confirmed && (
              <>
                {allSectionsConfirmed && completion >= 100 ? (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        </div>
                        <div>
                          <p className="text-base font-bold text-foreground">Profile 100% Complete & Live</p>
                          <p className="text-xs text-muted-foreground mt-0.5">All sections verified. Your AI matches are fully optimized.</p>
                        </div>
                      </div>
                      <button onClick={handleConfirmProfile}
                        className="inline-flex items-center gap-2 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-success-foreground transition-colors hover:bg-success/90">
                        <Check className="h-4 w-4" /> Confirm Profile
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card shadow-sm p-6 animate-fade-in">
                    <div className="flex items-center gap-6">
                      <CircularProgress percent={completion} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-foreground">{tier.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{tier.subtitle}</p>
                        <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                          {Object.values(sectionConfirmed).filter(Boolean).length}/4 sections approved
                        </p>
                      </div>
                      {tier.btnVariant === "solid" ? (
                        <button
                          onClick={triggerWalkthrough}
                          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shrink-0 transition-all bg-success text-success-foreground hover:bg-success/90 shadow-lg hover:-translate-y-0.5"
                        >
                          <PhosphorSparkle className="h-4 w-4" /> Finalize Profile
                        </button>
                      ) : (
                        <button
                          onClick={triggerWalkthrough}
                          style={{ borderColor: tier.stroke, color: tier.stroke }}
                          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shrink-0 transition-colors border-2 bg-transparent hover:bg-accent/10"
                        >
                          <PhosphorSparkle className="h-4 w-4" /> Complete Profile
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {confirmed && (
              <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-center">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Profile Verified
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Override warning dialog */}
      <AlertDialog open={showOverrideWarning} onOpenChange={setShowOverrideWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">Overwrite manual edits?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              You've made manual changes to this profile. Re-running the AI will overwrite your custom data with new AI predictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowOverrideWarning(false); handleAnalyze(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Overwrite & Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden logo input */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
    </div>
  );
});
