import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, type FocusEvent } from "react";
import { toast } from "@/hooks/use-toast";
import { Building2, Globe, Upload, FileText, AlertCircle, Loader2, Check, ChevronDown, ChevronUp, Camera, MapPin, Users, TrendingUp, DollarSign, Target, Briefcase, ShieldCheck, Sparkles, Lock, AlertTriangle, CheckCircle2, Eye, ArrowRight, RefreshCw } from "lucide-react";
import { InsightIcon } from "./company-profile/InsightIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GrowthMetrics } from "./company-profile/GrowthMetrics";
import { supabase } from "@/integrations/supabase/client";
import { SectorClassification } from "@/components/SectorTags";
import { Badge } from "@/components/ui/badge";
import { ProfileField } from "./company-profile/ProfileField";
import { CompetitorTagInput } from "./company-profile/CompetitorTagInput";
import { LocationAutocomplete } from "./company-profile/LocationAutocomplete";
import { SectorSubsectorPicker } from "./company-profile/SectorSubsectorPicker";
import { SectorHeatmap } from "./company-profile/SectorHeatmap";
import { normalizeSector } from "./company-profile/sectorNormalization";
import {
  CompanyData, AnalysisResult, EMPTY_FORM,
  stages, sectors, businessModels, targetCustomers,
  getCompletionPercent, subsectorsFor,
} from "./company-profile/types";

// Re-export types for backward compat
export type { CompanyData, AnalysisResult, ConfidenceLevel, MetricWithConfidence } from "./company-profile/types";

// ── Walkthrough types ──
type WalkthroughMode = "idle" | "analyzing" | "walkthrough" | "done";

// Section keys for the guided walkthrough
const WALKTHROUGH_SECTIONS = ["sector", "categorization", "competitive", "metrics"] as const;
type WalkthroughSection = typeof WALKTHROUGH_SECTIONS[number];

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

function cleanDomainToName(domain: string): string {
  let name = domain.replace(/^www\./, "");
  for (const tld of TLDS) {
    if (name.endsWith(tld)) { name = name.slice(0, -tld.length); break; }
  }
  const parts = name.split(".");
  name = parts[parts.length - 1];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

type AnalyzeStepKey = "scraping" | "analyzing" | "deepSearch" | "verifying" | "mapping" | "";
const STEP_LABELS: Record<AnalyzeStepKey, string> = {
  scraping: "Parsing Deck Structure...",
  analyzing: "Cross-referencing with live market data...",
  deepSearch: "Running Deep Search for recent filings...",
  verifying: "Verifying Headquarters via recent filings...",
  mapping: "Mapping Competitive Landscape...",
  "": "",
};

// Section processing spinner for focus mode
function SectionProcessingIndicator({ isAnalyzing }: { isAnalyzing: boolean }) {
  if (!isAnalyzing) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin text-accent" />
      <span className="text-[9px] font-mono text-accent animate-pulse">Processing...</span>
    </div>
  );
}

// Approve & Continue button injected at the bottom of walkthrough sections
function ApproveAndContinueButton({ onClick, isFinal, onConfirm, isSaving }: { onClick: () => void; isFinal: boolean; onConfirm?: () => void; isSaving?: boolean }) {
  if (isFinal) {
    return (
      <div className="flex justify-end pt-3 mt-3 border-t border-border/50">
        <button
          onClick={onConfirm}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/30 px-5 py-2.5 text-[13px] font-semibold text-success transition-all hover:bg-success/20 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            <><ShieldCheck className="h-4 w-4" /> Confirm Profile</>
          )}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-end pt-3 mt-3 border-t border-border/50">
      <button
        onClick={onClick}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground transition-all hover:bg-accent/90 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
        ) : (
          <>Approve & Continue <ArrowRight className="h-3.5 w-3.5" /></>
        )}
      </button>
    </div>
  );
}

export const CompanyProfile = forwardRef<CompanyProfileHandle, CompanyProfileProps>(function CompanyProfile({ onSave, onAnalysis, onSectorChange, onStageClassification, onProfileVerified, onWalkthroughComplete }, ref) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [form, setForm] = useState<CompanyData>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const p = JSON.parse(saved);
        // Sanitize: replace null/undefined/"null" with empty strings
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(p)) {
          if (v === null || v === undefined || v === "null") {
            sanitized[k] = Array.isArray(EMPTY_FORM[k as keyof CompanyData]) ? [] : "";
          } else {
            sanitized[k] = v;
          }
        }
        return { ...EMPTY_FORM, ...sanitized, competitors: Array.isArray(sanitized.competitors) ? sanitized.competitors.filter(Boolean) : [], subsectors: Array.isArray(sanitized.subsectors) ? sanitized.subsectors.filter(Boolean) : [] };
      }
    } catch {}
    return { ...EMPTY_FORM };
  });

  // Favicon state — restore from saved website on mount
  const [faviconUrl, setFaviconUrl] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const p = JSON.parse(saved);
        const domain = p.website ? extractDomain(p.website) : null;
        if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      }
    } catch {}
    return null;
  });
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const faviconDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which fields were manually touched by user (not AI)
  const [userTouched, setUserTouched] = useState<Set<keyof CompanyData>>(() => {
    try {
      const saved = localStorage.getItem("company-profile-touched");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // AI suggestions that differ from user input
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

  // Logo sync state
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

  // Progressive disclosure state for Growth Metrics
  const [metricsUnlocked, setMetricsUnlocked] = useState(() => {
    try { return localStorage.getItem("company-metrics-unlocked") === "true"; } catch { return false; }
  });
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [sectorExpanded, setSectorExpanded] = useState(false);
  const [categorizationExpanded, setCategorizationExpanded] = useState(false);
  const [competitiveExpanded, setCompetitiveExpanded] = useState(false);
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

  // ── Walkthrough state ──
  const [walkthroughMode, setWalkthroughMode] = useState<WalkthroughMode>("idle");
  const [activeWalkthroughStep, setActiveWalkthroughStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [metricsHasErrors, setMetricsHasErrors] = useState(false);
  // Track which fields AI updated in this analysis run (for highlighting)
  const [aiUpdatedFields, setAiUpdatedFields] = useState<Set<string>>(new Set());

  // Refs for scrolling sections into view
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const completion = getCompletionPercent(form);

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
        if (stageClassification) localStorage.setItem("company-stage-classification", JSON.stringify(stageClassification));
        if (form.name) { setSaveIndicator("Saved"); setTimeout(() => setSaveIndicator(null), 1500); }
      } catch {}
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form, userTouched]);

  // Auto-save profile to parent whenever form changes after analysis
  useEffect(() => {
    if (analysisComplete && form.name) {
      onSave?.(form);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Restore on mount
  useEffect(() => {
    if (form.name) {
      onSave?.(form);
      try {
        const savedAnalysis = localStorage.getItem("company-analysis");
        if (savedAnalysis) {
          onAnalysis?.(JSON.parse(savedAnalysis));
          setAnalysisComplete(true);
          setIsExpanded(true);
          setSectorExpanded(true);
          setCategorizationExpanded(true);
          setCompetitiveExpanded(true);
          setMetricsExpanded(true);
        }
      } catch {}
      // Restore verified state
      try {
        if (localStorage.getItem("company-profile-verified") === "true" && confirmed) {
          onProfileVerified?.(true);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (e: any) {
      setError(e.message || "Logo upload failed");
    } finally { setUploadingLogo(false); }
  };

  const METRIC_FIELDS: (keyof CompanyData)[] = ["currentARR", "yoyGrowth", "totalHeadcount"];

  // Data source state for tracking manual vs AI edits
  const [dataSource, setDataSource] = useState<"ai" | "deck" | "manual">(() => {
    try { return (localStorage.getItem("company-data-source") as any) || "ai"; } catch { return "ai"; }
  });
  const [originalFormSnapshot, setOriginalFormSnapshot] = useState<CompanyData | null>(null);

  useEffect(() => {
    try { localStorage.setItem("company-data-source", dataSource); } catch {}
  }, [dataSource]);
  const OUTPUT_FIELDS: (keyof CompanyData)[] = ["description", "stage", "sector", "businessModel", "targetCustomer", "hqLocation", "uniqueValueProp", "currentARR", "yoyGrowth", "totalHeadcount", "competitors"];

  const hasManualEdits = OUTPUT_FIELDS.some(f => userTouched.has(f) && form[f] && (Array.isArray(form[f]) ? (form[f] as string[]).length > 0 : String(form[f]).trim() !== ""));

  const handleAnalyzeClick = () => {
    if (hasManualEdits) {
      setShowOverrideWarning(true);
    } else {
      handleAnalyze();
    }
  };

  const update = (field: keyof CompanyData, value: string | string[]) => {
    // Sanitize: never store "null" string
    const sanitized = value === "null" || value === null ? (Array.isArray(value) ? [] : "") : value;
    setForm(prev => ({ ...prev, [field]: sanitized }));
    setUserTouched(prev => new Set(prev).add(field));
    setConfirmed(false);
    setAiSuggestions(prev => { const n = { ...prev }; delete n[field]; return n; });
    // Clear AI highlight on manual edit
    setAiUpdatedFields(prev => { const n = new Set(prev); n.delete(field); return n; });
    // Auto-verify metric fields on manual edit
    if (METRIC_FIELDS.includes(field)) {
      setVerifiedFields(prev => new Set(prev).add(field));
    }
    // Track manual data source for key fields
    const manualTrackFields: (keyof CompanyData)[] = ["currentARR", "totalHeadcount", "stage", "sector"];
    if (manualTrackFields.includes(field)) {
      if (dataSource !== "manual") {
        if (!originalFormSnapshot) setOriginalFormSnapshot({ ...form });
        setDataSource("manual");
      }
    }
  };

  const verifyField = (field: string) => {
    setVerifiedFields(prev => new Set(prev).add(field));
  };

  const confirmAllMetrics = () => {
    setMetricsConfirmed(true);
    METRIC_FIELDS.forEach(f => setVerifiedFields(prev => new Set(prev).add(f)));
  };

  const isMetricPending = (field: keyof CompanyData) =>
    metricsUnlocked && !metricsConfirmed && !verifiedFields.has(field) && !userTouched.has(field) && !!form[field];

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
      // Unlock and expand metrics on successful PDF parse
      setMetricsUnlocked(true);
      setMetricsExpanded(true);
      setScanningMetrics(true);
      // Simulate scanning pulse for 2s, actual extraction happens on "Run Analysis"
      setTimeout(() => setScanningMetrics(false), 2500);
    } catch { setError("Failed to read file. Try a different format."); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // Apply AI extracted data with "defer to user" rule
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
    ];

    // Normalize sector using the normalization layer
    const normalized = normalizeSector(
      aiExtracted.sector,
      sectorMapping?.subTag,
      sectorMapping?.keywords
    );

    setForm(prev => {
      const next = { ...prev };
      for (const { key, aiKey } of fieldMap) {
        const aiVal = aiExtracted[aiKey];
        if (!aiVal) continue;
        const userVal = prev[key];
        const touched = userTouched.has(key);
        if (!touched && (!userVal || userVal === "")) {
          (next as any)[key] = typeof aiVal === "string" ? aiVal : aiVal;
          updatedFields.add(key);
        } else if (touched && userVal && String(userVal) !== String(aiVal)) {
          newSuggestions[key] = String(aiVal);
        }
      }

      // Apply normalized sector
      if (normalized.sector) {
        if (!userTouched.has("sector") && (!prev.sector || prev.sector === "")) {
          next.sector = normalized.sector;
          updatedFields.add("sector");
        } else if (userTouched.has("sector") && prev.sector !== normalized.sector) {
          newSuggestions.sector = normalized.sector;
        }
      }

      // Apply normalized subsectors with deduplication
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
          if (!seenLower.has(lower)) {
            seenLower.add(lower);
            deduped.push(canonical);
          }
        }

        const userSubsLower = new Set(prev.subsectors.map(s => s.toLowerCase()));
        const newSubs = deduped.filter(s => !userSubsLower.has(s.toLowerCase()));

        for (const sub of deduped) {
          const userMatch = prev.subsectors.find(existing => existing.toLowerCase() === sub.toLowerCase());
          if (userMatch) {
            setVerifiedFields(vf => new Set(vf).add("subsectors"));
          }
        }

        if (!userTouched.has("sector") && prev.subsectors.length === 0) {
          next.subsectors = deduped.slice(0, 3);
          updatedFields.add("subsectors");
        }

        const allForSuggestion = [...newSubs];
        setAiSuggestedSubsectors(allForSuggestion.slice(0, 3));
        setAiOverflowSubsectors(allForSuggestion.slice(3));
      } else {
        setAiSuggestedSubsectors([]);
        setAiOverflowSubsectors([]);
      }

      // Handle competitors array
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
          if (!seenLower.has(lower)) {
            seenLower.add(lower);
            canonicalTags.push(canonical);
          }
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
    } finally {
      setIsReclassifying(false);
    }
  };

  // ── Walkthrough: expand a specific section, collapse others ──
  const expandWalkthroughSection = (step: number) => {
    const section = WALKTHROUGH_SECTIONS[step];
    setSectorExpanded(section === "sector");
    setCategorizationExpanded(section === "categorization");
    setCompetitiveExpanded(section === "competitive");
    setMetricsExpanded(section === "metrics");

    // Scroll the section into view
    setTimeout(() => {
      const ref = sectionRefs.current[section];
      if (ref) {
        ref.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  };

  const advanceWalkthrough = async () => {
    // Validation: check for metric errors on the metrics step
    const currentSection = WALKTHROUGH_SECTIONS[activeWalkthroughStep];
    if (currentSection === "metrics" && metricsHasErrors) {
      const ref = sectionRefs.current["metrics"];
      if (ref) ref.scrollIntoView({ behavior: "smooth", block: "center" });
      toast({
        title: "⚠️ Fix errors before continuing",
        description: "Please correct the highlighted fields in Growth Metrics.",
        variant: "destructive",
      });
      return;
    }

    // Show saving state
    setIsSaving(true);

    // Persist current form state
    try {
      localStorage.setItem("company-profile", JSON.stringify(form));
      localStorage.setItem("company-profile-touched", JSON.stringify([...userTouched]));
      onSave?.(form);
    } catch {}

    // Brief visual delay for saving feedback
    await new Promise(r => setTimeout(r, 400));
    setIsSaving(false);

    const nextStep = activeWalkthroughStep + 1;
    if (nextStep >= WALKTHROUGH_SECTIONS.length) {
      // Walkthrough complete — collapse all and exit
      setWalkthroughMode("done");
      setSectorExpanded(false);
      setCategorizationExpanded(false);
      setCompetitiveExpanded(false);
      setMetricsExpanded(false);
      onWalkthroughComplete?.();
    } else {
      // Collapse current section, advance to next
      setActiveWalkthroughStep(nextStep);
      expandWalkthroughSection(nextStep);
    }
  };

  const handleAnalyze = async () => {
    if (isEditing) { setError("Please finish editing fields before running analysis."); return; }
    if (!form.name.trim()) { setError("Company name is required."); return; }
    if (!form.website.trim() && !deckText) { setError("Provide a website URL or upload a pitch deck."); return; }

    setIsAnalyzing(true);
    setError(null);
    setHasNewInputs(false);
    let scrapedMarkdown = "";

    // ── FOCUS MODE: Collapse all sections during analysis ──
    setWalkthroughMode("analyzing");
    setSectorExpanded(false);
    setCategorizationExpanded(false);
    setCompetitiveExpanded(false);
    setMetricsExpanded(false);

    try {
      // Source A: Parse deck (if available)
      if (deckText) {
        setAnalyzeStep("scraping");
        await new Promise(r => setTimeout(r, 800));
      }

      // Source B: Scrape website
      if (form.website.trim()) {
        setAnalyzeStep("analyzing");
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("scrape-website", {
          body: { url: form.website.trim() },
        });
        if (!scrapeError && scrapeData?.markdown) {
          scrapedMarkdown = scrapeData.markdown;
          setWebsiteMarkdown(scrapedMarkdown);
        }
      }

      // Source C: Exa AI Deep Search for investors
      setAnalyzeStep("deepSearch");
      let deepSearchInvestors: any[] = [];
      try {
        const subsector = form.sector ? form.sector : "";
        const { data: exaData, error: exaError } = await supabase.functions.invoke("exa-search", {
          body: { companyName: form.name, subsector },
        });
        if (!exaError && exaData?.investors?.length > 0) {
          deepSearchInvestors = exaData.investors.map((inv: any) => ({
            investorName: inv.investorName,
            entityType: inv.entityType || "VC Firm",
            instrument: inv.instrument || "Equity",
            amount: inv.amount || 0,
            date: inv.date || "",
            source: "exa" as const,
            highlight: inv.highlight || "",
            sourceUrl: inv.sourceUrl || "",
            domain: inv.domain || "",
          }));
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existingAnalysis } = await supabase
            .from("company_analyses")
            .select("id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

          const companyDomain = form.website.trim()
            ? form.website.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
            : "";

          const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-investor-data", {
            body: {
              company_id: existingAnalysis?.id || crypto.randomUUID(),
              company_domain: companyDomain,
              user_id: user.id,
              company_name: form.name,
            },
          });
          if (!syncError && syncData?.newInvestorsFound > 0) {
            const { data: pendingRows } = await supabase
              .from("pending_investors")
              .select("investor_name, entity_type, instrument, amount, source_date")
              .eq("user_id", user.id)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(syncData.newInvestorsFound);

            const webInvestors = (pendingRows || []).map((p: any) => ({
              investorName: p.investor_name,
              entityType: p.entity_type,
              instrument: p.instrument,
              amount: p.amount || 0,
              date: p.source_date || "",
              source: "web" as const,
            }));
            const exaNames = new Set(deepSearchInvestors.map((i: any) => i.investorName.toLowerCase().trim()));
            for (const wi of webInvestors) {
              if (!exaNames.has(wi.investorName.toLowerCase().trim())) {
                deepSearchInvestors.push(wi);
              }
            }
          }
        }
      } catch (deepErr) {
        console.warn("Deep search failed (non-blocking):", deepErr);
      }

      // Run AI analysis with all sources
      setAnalyzeStep("verifying");
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-company", {
        body: { websiteText: scrapedMarkdown, deckText, companyName: form.name, stage: form.stage, sector: form.sector },
      });
      if (analysisError) throw new Error(analysisError.message || "Analysis failed");
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalyzeStep("mapping");

      // Apply AI data with defer-to-user logic + sector normalization
      applyAiData(analysisData.aiExtracted, analysisData.sectorMapping);

      // Capture metric sources
      if (analysisData.metricSources) {
        setMetricSources(analysisData.metricSources);
      }

      // Build source verification map
      const verification: Record<string, { sources: string[]; status: string; conflictDetail?: string }> = {};
      const fieldKeys = ["hqLocation", "stage", "sector", "currentARR", "yoyGrowth", "totalHeadcount", "businessModel", "targetCustomer", "uniqueValueProp", "competitors"];
      for (const field of fieldKeys) {
        const sources: string[] = [];
        const aiVal = analysisData.aiExtracted?.[field];
        if (deckText && aiVal) sources.push("deck");
        if (scrapedMarkdown && aiVal) sources.push("website");
        if (aiVal) sources.push("realtime");

        if (sources.length >= 3) {
          verification[field] = { sources, status: "verified" };
        } else if (sources.length === 1 && sources[0] === "deck") {
          verification[field] = { sources, status: "deck-only" };
        } else if (sources.length >= 1) {
          verification[field] = { sources, status: "predictive" };
        }
      }
      setSourceVerification(verification);

      // Capture stage classification
      if (analysisData.stageClassification) {
        setStageClassification(analysisData.stageClassification);
        onStageClassification?.(analysisData.stageClassification);
        if (!userTouched.has("stage") && analysisData.stageClassification.detected_stage) {
          setForm(prev => ({ ...prev, stage: analysisData.stageClassification.detected_stage }));
        }
      }

      setScanningMetrics(false);
      setAnalysisComplete(true);
      setIsExpanded(true);
      setMetricsUnlocked(true);

      // ── WALKTHROUGH MODE: Start guided review ──
      setWalkthroughMode("walkthrough");
      setActiveWalkthroughStep(0);
      expandWalkthroughSection(0);

      // Merge deck-extracted investors with deep search investors (deduplicated)
      const deckInvestors = analysisData.extractedInvestors || [];
      const seenNames = new Set(deckInvestors.map((i: any) => i.investorName?.toLowerCase().trim()));
      const mergedInvestors = [
        ...deckInvestors,
        ...deepSearchInvestors.filter((i: any) => !seenNames.has(i.investorName?.toLowerCase().trim())),
      ];

      const finalResult = { ...analysisData, extractedInvestors: mergedInvestors, sourceVerification: verification };
      onAnalysis?.(finalResult as AnalysisResult);
      try { localStorage.setItem("company-analysis", JSON.stringify(finalResult)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
      setWalkthroughMode("idle");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStep("");
    }
  };

  const handleConfirm = async () => {
    // Validate metrics errors
    if (metricsHasErrors) {
      const ref = sectionRefs.current["metrics"];
      if (ref) ref.scrollIntoView({ behavior: "smooth", block: "center" });
      toast({
        title: "⚠️ Fix errors before confirming",
        description: "Please correct the highlighted fields in Growth Metrics.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    setConfirmed(true);
    setAiSuggestions({});
    setAiSuggestedSubsectors([]);
    setAiUpdatedFields(new Set());
    
    const allKeys = Object.keys(form) as (keyof CompanyData)[];
    setUserTouched(new Set(allKeys.filter(k => {
      const v = form[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    })));
    
    setMetricsConfirmed(true);
    METRIC_FIELDS.forEach(f => setVerifiedFields(prev => new Set(prev).add(f)));

    // Collapse all sections
    setSectorExpanded(false);
    setCategorizationExpanded(false);
    setCompetitiveExpanded(false);
    setMetricsExpanded(false);
    
    // Persist
    try {
      localStorage.setItem("company-profile", JSON.stringify(form));
      localStorage.setItem("company-profile-verified", "true");
    } catch {}
    
    onSave?.(form);
    onProfileVerified?.(true);

    // Brief saving feedback
    await new Promise(r => setTimeout(r, 400));
    setIsSaving(false);
    
    setWalkthroughMode("done");
    setIsExpanded(false);
    
    toast({
      title: "✅ Profile Verified",
      description: "Data locked. Investor Matching and Benchmarking are now live!",
    });
  };

  const isFieldAiDraft = (field: keyof CompanyData) => !confirmed && !userTouched.has(field) && !!form[field];
  const isFieldAiHighlighted = (field: string) => walkthroughMode === "walkthrough" && aiUpdatedFields.has(field);

  const inputCls = (field: keyof CompanyData) =>
    `w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all duration-300 ${
      isFieldAiDraft(field) ? "bg-accent/5 border-accent/20" : "bg-background"
    } ${isFieldAiHighlighted(field) ? "!bg-accent/10 !border-accent/30 ring-1 ring-accent/20" : ""}`;

  const selectCls = (field: keyof CompanyData) =>
    `w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all duration-300 appearance-none ${
      isFieldAiDraft(field) ? "bg-accent/5 border-accent/20" : "bg-background"
    } ${isFieldAiHighlighted(field) ? "!bg-accent/10 !border-accent/30 ring-1 ring-accent/20" : ""}`;

  const isEditableElement = (element: Element | null): boolean => {
    if (!element) return false;
    const editableSelector = "input, textarea, select, [contenteditable='true']";
    return element.matches(editableSelector) || !!element.closest(editableSelector);
  };

  const handleOutputFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    if (isEditableElement(event.target as Element)) {
      setIsEditing(true);
    }
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

  // Whether a section can be manually toggled (disabled only during analyzing)
  const isSectionLocked = walkthroughMode === "analyzing";
  const isWalkthrough = walkthroughMode === "walkthrough";

  // Sections are only locked during active analysis — fully interactive otherwise
  const canToggleSection = (_section: WalkthroughSection) => {
    if (walkthroughMode === "analyzing") return false;
    return true;
  };

  // Verification badge renderer
  const renderVerificationBadge = (field: string) => {
    const v = sourceVerification[field];
    if (!v || !analysisComplete) return null;
    if (userTouched.has(field as keyof CompanyData)) return null;
    if (v.status === "verified") {
      return (
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-success/10 text-success border-success/20 gap-0.5">
          <CheckCircle2 className="h-2.5 w-2.5" /> Verified
        </Badge>
      );
    }
    if (v.status === "deck-only") {
      return (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-purple-500/10 text-purple-600 border-purple-500/20 gap-0.5 cursor-help">
              📄 Deck-Verified
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] max-w-[200px]">
            {metricSources[field] || `Extracted from your Pitch Deck`}
          </TooltipContent>
        </Tooltip>
      );
    }
    if (v.status === "conflict") {
      return (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/20 gap-0.5 cursor-help">
              <AlertTriangle className="h-2.5 w-2.5" /> Conflict
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] max-w-[220px]">
            {v.conflictDetail || "Sources disagree on this value"}
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20 gap-0.5 cursor-help">
            ✨ Predictive
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px] max-w-[200px]">
          {metricSources[field] || `Inferred from website scrape & web search`}
        </TooltipContent>
      </Tooltip>
    );
  };

  // AI Updated badge for walkthrough highlighting
  const renderAiUpdatedBadge = (field: string) => {
    if (!isFieldAiHighlighted(field)) return null;
    return (
      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20 gap-0.5 animate-pulse">
        <Sparkles className="h-2.5 w-2.5" /> AI Updated
      </Badge>
    );
  };

  const summaryParts = [form.name, form.stage, form.sector].filter(Boolean);

  // Section header classes for focus mode
  const sectionHeaderClass = (_section: WalkthroughSection) => {
    const base = "flex w-full items-center justify-between px-4 py-3";
    if (walkthroughMode === "analyzing") return `${base} cursor-not-allowed opacity-70`;
    return `${base} cursor-pointer hover:bg-muted/30 transition-colors`;
  };

  return (
    <div className="surface-card">
      {/* Header — always visible */}
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex w-full items-center justify-between p-5">
        <div className="flex items-center gap-3 relative">
          <button type="button" onClick={e => { e.stopPropagation(); if (isExpanded) logoInputRef.current?.click(); }}
            className={`relative flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 overflow-hidden group transition-colors ${isExpanded ? "hover:bg-accent/20 cursor-pointer" : "cursor-default"}`} title={isExpanded ? "Upload logo" : "Expand to change logo"}>
            {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : logoUrl ? (
              <>
                <img src={logoUrl} alt="Logo" className="h-full w-full object-cover transition-opacity duration-500" />
                {isExpanded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-3.5 w-3.5 text-foreground" />
                  </div>
                )}
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4 text-accent group-hover:hidden" />
                <Camera className="h-4 w-4 text-accent hidden group-hover:block" />
              </>
            )}
            {logoSyncBadge && (
              <div className="absolute -bottom-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-medium text-accent-foreground animate-in fade-in zoom-in duration-300 shadow-sm">
                <Sparkles className="h-2.5 w-2.5" /> Synced
              </div>
            )}
          </button>
          {suggestedLogoUrl && (
            <div className="absolute top-full left-0 mt-1.5 z-20 flex items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-surface-md animate-in fade-in slide-in-from-top-1 duration-200" onClick={e => e.stopPropagation()}>
              <img src={suggestedLogoUrl} alt="Suggested logo" className="h-8 w-8 rounded-md object-contain bg-muted" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">New logo found via URL.</span>
                <div className="flex items-center gap-1.5">
                  <button className="text-[10px] font-medium text-accent hover:underline" onClick={() => { setLogoUrl(suggestedLogoUrl); setSuggestedLogoUrl(null); }}>Apply</button>
                  <button className="text-[10px] font-medium text-muted-foreground hover:underline" onClick={() => setSuggestedLogoUrl(null)}>Keep Current</button>
                </div>
              </div>
            </div>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onClick={e => e.stopPropagation()} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
          <div className="text-left">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{form.name || "Company Profile"}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {!isExpanded && summaryParts.length > 1
                ? summaryParts.join(" · ")
                : "Add your company details to run AI analysis"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isWalkthrough && (
            <Badge variant="secondary" className="text-[9px] px-2 py-0.5 bg-accent/10 text-accent border-accent/20 gap-1 animate-pulse">
              <Eye className="h-2.5 w-2.5" /> Review {activeWalkthroughStep + 1}/{WALKTHROUGH_SECTIONS.length}
            </Badge>
          )}
          {saveIndicator && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground animate-in fade-in">
              <Check className="h-3 w-3" /> {saveIndicator}
            </span>
          )}
          {analysisComplete && walkthroughMode !== "walkthrough" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Analyzed
            </span>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* ═══════════════════════════════════════════════
                LEFT COLUMN: DATA SOURCES (col-span-4)
                ═══════════════════════════════════════════════ */}
            <div className="lg:col-span-4">
              <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5 sticky top-6 transition-opacity duration-300 ${isAnalyzing ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h3>
                </div>

                {/* === Core Info === */}
                <div className="space-y-4">
                  <ProfileField label="Company Name *">
                    <input type="text" value={form.name} onChange={e => update("name", e.target.value)}
                      placeholder="Acme Corp" maxLength={100} disabled={isAnalyzing} className={inputCls("name")} />
                  </ProfileField>
                  <ProfileField label="Stage" isAiDraft={isFieldAiDraft("stage")}
                    aiSuggestion={aiSuggestions.stage} onApplySuggestion={() => update("stage", aiSuggestions.stage!)}>
                    <div className="flex items-center gap-1.5">
                      <select value={form.stage} onChange={e => update("stage", e.target.value)} disabled={isAnalyzing} className={selectCls("stage")}>
                        <option value="" disabled>Select stage</option>
                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {renderAiUpdatedBadge("stage")}
                      {renderVerificationBadge("stage")}
                      {analysisComplete && <InsightIcon field="stage" label="Stage" />}
                    </div>
                  </ProfileField>
                </div>

                {/* Website URL */}
                <ProfileField label="Website URL" icon={<Globe className="inline h-3 w-3" />}>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5">
                      {faviconUrl && faviconLoaded ? (
                        <img
                          src={faviconUrl}
                          alt=""
                          className="w-5 h-5 rounded-sm animate-in fade-in duration-300"
                          onError={() => { setFaviconLoaded(false); setFaviconUrl(null); }}
                        />
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
                            const fav = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                            setFaviconUrl(fav);
                            setFaviconLoaded(false);
                            const img = new Image();
                            img.onload = () => setFaviconLoaded(true);
                            img.onerror = () => { setFaviconUrl(null); setFaviconLoaded(false); };
                            img.src = fav;

                            if (!form.name.trim() && !userTouched.has("name")) {
                              const cleaned = cleanDomainToName(domain);
                              if (cleaned) setForm(prev => ({ ...prev, name: cleaned }));
                            }
                          } else {
                            setFaviconUrl(null);
                            setFaviconLoaded(false);
                          }
                        }, 300);

                        if (logoSyncDebounceRef.current) clearTimeout(logoSyncDebounceRef.current);
                        logoSyncDebounceRef.current = setTimeout(() => {
                          const domain = extractDomain(url);
                          if (!domain) { setSuggestedLogoUrl(null); return; }
                          const hdLogoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                          const testImg = new Image();
                          testImg.onload = () => {
                            if (!logoUrl) {
                              setLogoUrl(hdLogoUrl);
                              setLogoSyncBadge(true);
                              setTimeout(() => setLogoSyncBadge(false), 3000);
                            } else if (logoUrl !== hdLogoUrl) {
                              setSuggestedLogoUrl(hdLogoUrl);
                            }
                          };
                          testImg.onerror = () => {};
                          testImg.src = hdLogoUrl;
                        }, 500);
                      }}
                      placeholder="https://acme.com" maxLength={255}
                      className={`${inputCls("website")} pl-10`}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">We'll scrape your site for value prop & pricing</p>
                </ProfileField>

                {/* Pitch Deck */}
                <ProfileField label="Pitch Deck (PDF)" icon={<FileText className="inline h-3 w-3" />}>
                  <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
                      scanningMetrics
                        ? "border-accent/60 bg-accent/5 deck-scan-line"
                        : "border-border bg-muted/30 hover:border-accent/40"
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
                </ProfileField>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
                  </div>
                )}

                {/* Run Analysis Button */}
                {(() => {
                  const isAnalyzedIdle = analysisComplete && !hasNewInputs;
                  const btnClass = isAnalyzing
                    ? "flex w-full items-center justify-center gap-2 rounded-lg bg-accent/80 px-5 py-3 text-[13px] font-medium text-accent-foreground opacity-80 cursor-not-allowed mt-2"
                    : isAnalyzedIdle
                      ? "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                      : "flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed mt-2";
                  const btnLabel = isAnalyzing
                    ? "Analyzing Data..."
                    : hasNewInputs
                      ? "Update AI Analysis"
                      : isAnalyzedIdle
                        ? "Re-run Analysis"
                        : "Run AI Analysis";
                  return (
                    <button onClick={handleAnalyzeClick} disabled={!canAnalyze || isAnalyzing} className={btnClass}>
                      {isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {!isAnalyzing && isAnalyzedIdle && <RefreshCw className="h-3.5 w-3.5" />}
                      {btnLabel}
                    </button>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground text-center">Triple-source triangulation: Deck + Website + Deep Search</p>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════
                RIGHT COLUMN: AI PROFILE (col-span-8)
                ═══════════════════════════════════════════════ */}
            <div className="lg:col-span-8">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                {/* Right column header */}
                <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 overflow-hidden">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{form.name || "Company"} Profile</h3>
                      <p className="text-[10px] text-muted-foreground">AI-populated from your data sources</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Data source badge & revert */}
                    {dataSource === "manual" && originalFormSnapshot && (
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              setForm(originalFormSnapshot);
                              setDataSource("ai");
                              setOriginalFormSnapshot(null);
                              toast({ title: "Reverted to AI data", description: "Manual changes have been undone." });
                            }}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <RotateCcw className="h-3 w-3" /> Revert
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-[10px]">Revert to original AI-extracted values</TooltipContent>
                      </Tooltip>
                    )}
                    {dataSource === "manual" && (
                      <Badge variant="secondary" className="text-[9px] px-2 py-0.5 bg-muted text-muted-foreground border-border">
                        <Pencil className="h-2.5 w-2.5 mr-0.5" /> Manual
                      </Badge>
                    )}
                    {isAnalyzing ? (
                      <>
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full animate-progress-fill" style={{ background: "hsl(var(--warning))" }} />
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5 bg-warning/10 text-warning border-warning/20">
                          In Progress
                        </Badge>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 ease-out"
                              style={{
                                width: `${completion}%`,
                                background: completion === 100
                                  ? "hsl(var(--success))"
                                  : "hsl(var(--accent))",
                              }}
                            />
                          </div>
                          <Badge variant="secondary" className={`text-[10px] font-mono px-2 py-0.5 ${completion === 100 ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}`}>
                            {completion}%
                          </Badge>
                        </div>
                        {analysisComplete && walkthroughMode !== "walkthrough" && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                            </span>
                            Analyzed
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* AI Profile Content */}
                <div
                  ref={outputSectionsRef}
                  onFocusCapture={handleOutputFocusCapture}
                  onBlurCapture={handleOutputBlurCapture}
                  className={`space-y-4 transition-all duration-500 ${!analysisComplete && !isAnalyzing ? "opacity-40 pointer-events-none" : "opacity-100"}`}>

                  {/* Pre-analysis placeholder */}
                  {!analysisComplete && !isAnalyzing && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Run analysis to auto-populate these fields</span>
                    </div>
                  )}

                  {/* === CENTER STAGE TERMINAL (during analysis) === */}
                  {isAnalyzing && (
                    <div className="flex items-center justify-center py-12 animate-in fade-in duration-500">
                      <div className="w-full max-w-lg rounded-2xl border border-accent/30 overflow-hidden terminal-glow"
                        style={{ background: "linear-gradient(145deg, hsl(222 47% 8%), hsl(222 47% 12%))" }}>
                        {/* Terminal header */}
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

                        {/* Terminal body */}
                        <div className="px-5 py-5 space-y-3 relative">
                          {/* Laser scan overlay */}
                          <div className="absolute inset-0 pointer-events-none deck-scan-line" />

                          <div className="font-mono text-[11px] leading-loose space-y-2 relative z-10" style={{ color: "rgba(226, 232, 240, 0.75)" }}>
                            {analyzeStep === "scraping" && (
                              <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-purple-400 font-semibold">[PDF]</span>
                                <span>Parsing Deck Structure...</span>
                                <Loader2 className="h-3 w-3 animate-spin text-purple-400 ml-auto mt-0.5" />
                              </div>
                            )}
                            {(analyzeStep === "analyzing" || analyzeStep === "deepSearch" || analyzeStep === "verifying" || analyzeStep === "mapping") && (
                              <>
                                <div className="flex gap-2 opacity-50"><span className="text-purple-400 font-semibold">[PDF]</span> Deck layers extracted ✓</div>
                                <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="text-cyan-400 font-semibold">[WEB]</span>
                                  <span>Scraping website content...</span>
                                  {analyzeStep === "analyzing" && <Loader2 className="h-3 w-3 animate-spin text-cyan-400 ml-auto mt-0.5" />}
                                </div>
                              </>
                            )}
                            {(analyzeStep === "deepSearch" || analyzeStep === "verifying" || analyzeStep === "mapping") && (
                              <>
                                <div className="flex gap-2 opacity-50"><span className="text-cyan-400 font-semibold">[WEB]</span> Website scraped ✓</div>
                                <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="text-yellow-400 font-semibold">[SEARCH]</span>
                                  <span>Cross-referencing SEC filings and funding news...</span>
                                  {analyzeStep === "deepSearch" && <Loader2 className="h-3 w-3 animate-spin text-yellow-400 ml-auto mt-0.5" />}
                                </div>
                              </>
                            )}
                            {(analyzeStep === "verifying" || analyzeStep === "mapping") && (
                              <>
                                <div className="flex gap-2 opacity-50"><span className="text-yellow-400 font-semibold">[SEARCH]</span> Real-time data captured ✓</div>
                                <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="text-emerald-400 font-semibold">[AI]</span>
                                  <span>Cross-referencing sources & mapping sectors...</span>
                                  {analyzeStep === "verifying" && <Loader2 className="h-3 w-3 animate-spin text-emerald-400 ml-auto mt-0.5" />}
                                </div>
                              </>
                            )}
                            {analyzeStep === "mapping" && (
                              <>
                                <div className="flex gap-2 opacity-50"><span className="text-emerald-400 font-semibold">[AI]</span> Sectors mapped ✓</div>
                                <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="text-orange-400 font-semibold">[MAP]</span>
                                  <span>Mapping competitive landscape...</span>
                                  <Loader2 className="h-3 w-3 animate-spin text-orange-400 ml-auto mt-0.5" />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Data particles */}
                          <div className="flex justify-center gap-6 pt-4 overflow-hidden h-16">
                            {["$ARR", "Growth", "Sector", "Stage", "HQ"].map((label, i) => (
                              <div key={label} className="animate-particle-float text-[9px] font-mono text-accent/60 px-2 py-0.5 rounded-full border border-accent/20 bg-accent/5"
                                style={{ animationDelay: `${i * 0.4}s`, animationIterationCount: "infinite" }}>
                                {label}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Terminal footer */}
                        <div className="px-5 py-3 border-t border-accent/15 flex items-center justify-between">
                          <span className="font-mono text-[9px] text-accent/40">Triple-source triangulation active</span>
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                            <span className="font-mono text-[9px] text-accent/60">LIVE</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

            {/* Accordion sections — hidden during analysis, fade in when done */}
            {!isAnalyzing && (
            <>
            {/* === SECTION: Sector & Subsectors === */}
            <div
              ref={el => { sectionRefs.current["sector"] = el; }}
              className={`rounded-xl border transition-all duration-300 ${
                isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "sector"
                  ? "border-accent/40 bg-card shadow-surface-md ring-1 ring-accent/10"
                  : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => canToggleSection("sector") && setSectorExpanded(!sectorExpanded)}
                className={sectionHeaderClass("sector")}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3 text-accent" />
                  Sector & Subsectors
                  {form.sector && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20 ml-1">{form.sector}</Badge>
                  )}
                  {analysisComplete && <InsightIcon field="sector" label="Sector" />}
                </span>
                <div className="flex items-center gap-2">
                  <SectionProcessingIndicator isAnalyzing={walkthroughMode === "analyzing"} />
                  {sectorExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>
              </button>
              {sectorExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
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
                      />
                    </div>
                    {renderAiUpdatedBadge("sector")}
                    {renderVerificationBadge("sector")}
                  </div>
                  {/* Walkthrough: Approve & Continue */}
                  {isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "sector" && (
                    <ApproveAndContinueButton onClick={advanceWalkthrough} isFinal={false} isSaving={isSaving} />
                  )}
                </div>
              )}
            </div>

            {/* === SECTION: Categorization === */}
            <div
              ref={el => { sectionRefs.current["categorization"] = el; }}
              className={`rounded-xl border transition-all duration-300 ${
                isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "categorization"
                  ? "border-accent/40 bg-card shadow-surface-md ring-1 ring-accent/10"
                  : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => canToggleSection("categorization") && setCategorizationExpanded(!categorizationExpanded)}
                className={sectionHeaderClass("categorization")}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3 text-accent" />
                  Categorization
                  {form.businessModel && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20 ml-1">{form.businessModel}</Badge>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <SectionProcessingIndicator isAnalyzing={walkthroughMode === "analyzing"} />
                  {categorizationExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>
              </button>
              {categorizationExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="grid grid-cols-3 gap-4">
                    <ProfileField label="Business Model" isAiDraft={isFieldAiDraft("businessModel")}
                      aiSuggestion={aiSuggestions.businessModel} onApplySuggestion={() => update("businessModel", aiSuggestions.businessModel!)}>
                      <div className="flex items-center gap-1.5">
                        <select value={form.businessModel} onChange={e => update("businessModel", e.target.value)} className={selectCls("businessModel")}>
                          <option value="" disabled>Select model</option>
                          {businessModels.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {renderAiUpdatedBadge("businessModel")}
                        {renderVerificationBadge("businessModel")}
                      </div>
                    </ProfileField>
                    <ProfileField label="Target Customer" isAiDraft={isFieldAiDraft("targetCustomer")}
                      aiSuggestion={aiSuggestions.targetCustomer} onApplySuggestion={() => update("targetCustomer", aiSuggestions.targetCustomer!)}>
                      <div className="flex items-center gap-1.5">
                        <select value={form.targetCustomer} onChange={e => update("targetCustomer", e.target.value)} className={selectCls("targetCustomer")}>
                          <option value="" disabled>Select type</option>
                          {targetCustomers.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {renderAiUpdatedBadge("targetCustomer")}
                        {renderVerificationBadge("targetCustomer")}
                      </div>
                    </ProfileField>
                    <ProfileField label="HQ Location" icon={<MapPin className="inline h-3 w-3" />}
                      isAiDraft={isFieldAiDraft("hqLocation")}
                      aiSuggestion={aiSuggestions.hqLocation} onApplySuggestion={() => update("hqLocation", aiSuggestions.hqLocation!)}>
                      <div className="flex items-center gap-1.5">
                        <LocationAutocomplete value={form.hqLocation} onChange={v => update("hqLocation", v)}
                          className={inputCls("hqLocation")} />
                        {renderAiUpdatedBadge("hqLocation")}
                        {renderVerificationBadge("hqLocation")}
                      </div>
                    </ProfileField>
                  </div>
                  {isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "categorization" && (
                    <ApproveAndContinueButton onClick={advanceWalkthrough} isFinal={false} isSaving={isSaving} />
                  )}
                </div>
              )}
            </div>

            {/* === SECTION: Competitive Landscape === */}
            <div
              ref={el => { sectionRefs.current["competitive"] = el; }}
              className={`rounded-xl border transition-all duration-300 ${
                isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "competitive"
                  ? "border-accent/40 bg-card shadow-surface-md ring-1 ring-accent/10"
                  : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => canToggleSection("competitive") && setCompetitiveExpanded(!competitiveExpanded)}
                className={sectionHeaderClass("competitive")}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-3 w-3 text-accent" />
                  Competitive Landscape
                  {form.competitors.length > 0 && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20 ml-1">{form.competitors.length} competitors</Badge>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <SectionProcessingIndicator isAnalyzing={walkthroughMode === "analyzing"} />
                  {competitiveExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>
              </button>
              {competitiveExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="space-y-4">
                    <ProfileField label="Direct Competitors" isAiDraft={isFieldAiDraft("competitors")}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
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
                        {renderAiUpdatedBadge("competitors")}
                        {renderVerificationBadge("competitors")}
                      </div>
                    </ProfileField>
                    <ProfileField label="Unique Value Proposition" isAiDraft={isFieldAiDraft("uniqueValueProp")}
                      aiSuggestion={aiSuggestions.uniqueValueProp} onApplySuggestion={() => update("uniqueValueProp", aiSuggestions.uniqueValueProp!)}>
                      <div className="flex items-start gap-1.5">
                        <textarea value={form.uniqueValueProp} onChange={e => update("uniqueValueProp", e.target.value)}
                          placeholder="What makes your product uniquely defensible?"
                          rows={2} className={`${inputCls("uniqueValueProp")} min-h-[60px] resize-none flex-1`} />
                        {renderAiUpdatedBadge("uniqueValueProp")}
                        {renderVerificationBadge("uniqueValueProp")}
                      </div>
                    </ProfileField>
                  </div>
                  {isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "competitive" && (
                    <ApproveAndContinueButton onClick={advanceWalkthrough} isFinal={false} isSaving={isSaving} />
                  )}
                </div>
              )}
            </div>

            {/* === SECTION: Growth Metrics === */}
            <div
              ref={el => { sectionRefs.current["metrics"] = el; }}
              className={`rounded-xl border transition-all duration-300 ${
                isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "metrics"
                  ? "border-accent/40 bg-card shadow-surface-md ring-1 ring-accent/10"
                  : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => canToggleSection("metrics") && setMetricsExpanded(!metricsExpanded)}
                className={sectionHeaderClass("metrics")}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-accent" />
                  Growth Metrics
                </span>
                <div className="flex items-center gap-2">
                  <SectionProcessingIndicator isAnalyzing={walkthroughMode === "analyzing"} />
                  {metricsExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>
              </button>
              {metricsExpanded && !isAnalyzing && (
                <div className="border-t border-border px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <GrowthMetrics
                    currentARR={form.currentARR}
                    yoyGrowth={form.yoyGrowth}
                    totalHeadcount={form.totalHeadcount}
                    onChange={(field, value) => update(field, value)}
                    dataSource={metricsConfirmed ? "deck" : "ai"}
                    disabled={isAnalyzing}
                    onErrorStateChange={setMetricsHasErrors}
                  />
                  {/* Walkthrough: Approve & Continue (final step) */}
                  {isWalkthrough && WALKTHROUGH_SECTIONS[activeWalkthroughStep] === "metrics" && (
                    <ApproveAndContinueButton onClick={advanceWalkthrough} isFinal={true} onConfirm={handleConfirm} isSaving={isSaving} />
                  )}
                </div>
              )}
            </div>
            </>
            )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Override warning dialog */}
      <AlertDialog open={showOverrideWarning} onOpenChange={setShowOverrideWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              Overwrite manual edits?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              You've made manual changes to this profile. Re-running the AI will overwrite your custom data with new AI predictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowOverrideWarning(false); handleAnalyze(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Overwrite & Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
