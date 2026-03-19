import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, type FocusEvent } from "react";
import { toast } from "@/hooks/use-toast";
import { Building2, Globe, Upload, FileText, AlertCircle, Loader2, Check, Camera, MapPin, Users, TrendingUp, DollarSign, Target, Briefcase, Sparkles, Lock, AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Pencil, Twitter, Linkedin, Instagram } from "lucide-react";
import { InsightIcon } from "./company-profile/InsightIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { SectorClassification } from "@/components/SectorTags";
import { Badge } from "@/components/ui/badge";
import { ProfileField } from "./company-profile/ProfileField";
import { CompetitorTagInput } from "./company-profile/CompetitorTagInput";
import { LocationAutocomplete } from "./company-profile/LocationAutocomplete";
import { SectorSubsectorPicker } from "./company-profile/SectorSubsectorPicker";
import { normalizeSector } from "./company-profile/sectorNormalization";
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

// ── Field badge: AI vs Edited ──
function FieldBadge({ isAi }: { isAi: boolean }) {
  if (isAi) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/10 border border-accent/20 px-1.5 py-0 text-[9px] font-semibold text-accent">
        <Sparkles className="h-2.5 w-2.5" /> AI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted border border-border px-1.5 py-0 text-[9px] font-semibold text-muted-foreground">
      <Pencil className="h-2.5 w-2.5" /> Edited
    </span>
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
        return { ...EMPTY_FORM, ...sanitized, competitors: Array.isArray(sanitized.competitors) ? sanitized.competitors.filter(Boolean) : [], subsectors: Array.isArray(sanitized.subsectors) ? sanitized.subsectors.filter(Boolean) : [] };
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
        if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      }
    } catch {}
    return null;
  });
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const faviconDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const OUTPUT_FIELDS: (keyof CompanyData)[] = ["description", "stage", "sector", "businessModel", "targetCustomer", "hqLocation", "uniqueValueProp", "currentARR", "yoyGrowth", "totalHeadcount", "competitors"];
  const hasManualEdits = OUTPUT_FIELDS.some(f => userTouched.has(f) && form[f] && (Array.isArray(form[f]) ? (form[f] as string[]).length > 0 : String(form[f]).trim() !== ""));

  const handleAnalyzeClick = () => {
    if (hasManualEdits) setShowOverrideWarning(true);
    else handleAnalyze();
  };

  const update = (field: keyof CompanyData, value: string | string[]) => {
    const sanitized = value === "null" || value === null ? (Array.isArray(value) ? [] : "") : value;
    setForm(prev => ({ ...prev, [field]: sanitized }));
    setUserTouched(prev => new Set(prev).add(field));
    setConfirmed(false);
    setAiSuggestions(prev => { const n = { ...prev }; delete n[field]; return n; });
    setAiUpdatedFields(prev => { const n = new Set(prev); n.delete(field); return n; });
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
    ];

    const normalized = normalizeSector(aiExtracted.sector, sectorMapping?.subTag, sectorMapping?.keywords);

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
      if (analysisData.metricSources) setMetricSources(analysisData.metricSources);

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
      setMetricsUnlocked(true);
      setOriginalFormSnapshot(null);
      setDataSource("ai");

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
    }`;

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

  // Auto-calculated LTV/CAC ratio
  const ltvCacRatio = (() => {
    const ltv = parseSmartNumber(form.ltv);
    const cac = parseSmartNumber(form.cac);
    if (ltv && cac) return (ltv / cac).toFixed(1) + "x";
    return "—";
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* ═══════════════════════════════════════════════
          LEFT COLUMN: DATA SOURCES (col-span-4) — sticky
          ═══════════════════════════════════════════════ */}
      <div className="lg:col-span-4">
        <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5 lg:sticky lg:top-6 transition-opacity duration-300 ${isAnalyzing ? "opacity-70 pointer-events-none" : ""}`}>
          {/* Card header */}
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h3>
          </div>

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
                      const fav = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
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
                  if (logoSyncDebounceRef.current) clearTimeout(logoSyncDebounceRef.current);
                  logoSyncDebounceRef.current = setTimeout(() => {
                    const domain = extractDomain(url);
                    if (!domain) { setSuggestedLogoUrl(null); return; }
                    const hdLogoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                    const testImg = new Image();
                    testImg.onload = () => {
                      if (!logoUrl) { setLogoUrl(hdLogoUrl); setLogoSyncBadge(true); setTimeout(() => setLogoSyncBadge(false), 3000); }
                      else if (logoUrl !== hdLogoUrl) setSuggestedLogoUrl(hdLogoUrl);
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

          {/* Re-run Analysis Button */}
          <button onClick={handleAnalyzeClick} disabled={!canAnalyze || isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {isAnalyzing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...</>
            ) : (
              <><RefreshCw className="h-3.5 w-3.5" /> {analysisComplete ? "Re-run Analysis" : "Run AI Analysis"}</>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">Triple-source triangulation: Deck + Website + Deep Search</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          RIGHT COLUMN: GENERATED PROFILE (col-span-8) — scrollable
          ═══════════════════════════════════════════════ */}
      <div className="lg:col-span-8 space-y-6" ref={outputSectionsRef} onFocusCapture={handleOutputFocusCapture} onBlurCapture={handleOutputBlurCapture}>

        {/* Right column header: Generated Profile + autosave + progress */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Generated Profile</h3>
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
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-accent" /> 💼 Company Overview
                </h3>
                {analysisComplete && (aiUpdatedFields.has("stage") || aiUpdatedFields.has("sector") || aiUpdatedFields.has("businessModel") || aiUpdatedFields.has("targetCustomer") || aiUpdatedFields.has("hqLocation")) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/20 px-2 py-0.5 text-[9px] font-semibold text-accent">
                    <Sparkles className="h-2.5 w-2.5" /> AI Categorized
                  </span>
                )}
              </div>

              {/* Row 1: Stage | Sector | Subsectors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Stage {renderFieldBadge("stage")}
                  </label>
                  <select value={form.stage} onChange={e => update("stage", e.target.value)} className={selectCls("stage")}>
                    <option value="" disabled>Select stage</option>
                    {stages.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Sector & Subsectors {renderFieldBadge("sector")}
                  </label>
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
              </div>

              {/* Row 2: Business Model | Target Customer | HQ Location */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Business Model {renderFieldBadge("businessModel")}
                  </label>
                  <input type="text" value={form.businessModel} onChange={e => update("businessModel", e.target.value)}
                    placeholder="e.g. SaaS, Marketplace" className={inputCls("businessModel")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Target Customer {renderFieldBadge("targetCustomer")}
                  </label>
                  <select value={form.targetCustomer} onChange={e => update("targetCustomer", e.target.value)} className={selectCls("targetCustomer")}>
                    <option value="" disabled>Select market</option>
                    {targetCustomers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    HQ Location {renderFieldBadge("hqLocation")}
                  </label>
                  <LocationAutocomplete value={form.hqLocation} onChange={v => update("hqLocation", v)} className={inputCls("hqLocation")} />
                </div>
              </div>
            </div>

            {/* ─── CARD 2: Positioning & Links ─── */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-accent" /> Positioning & Links
              </h3>

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

            </div>

            {/* ─── CARD 3: Health & Unit Economics ─── */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
              {/* Header with segmented control */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-accent" /> Metrics
                </h3>
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

              {/* Divider */}
              <hr className="border-border/50" />

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

                  {/* LTV/CAC Ratio (auto-calculated, disabled) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">LTV / CAC Ratio</label>
                    <div className="relative">
                      <input type="text" value={ltvCacRatio} disabled
                        className="w-full rounded-lg border border-border bg-accent/5 px-3 py-2.5 text-sm font-semibold text-accent/80 cursor-not-allowed" />
                      {ltvCacRatio !== "—" && (
                        <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent/50" />
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
            </div>

            {/* ─── CARD 4: Social Links ─── */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social Links</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input type="url" value={form.socialTwitter} onChange={e => update("socialTwitter", e.target.value)}
                    placeholder="x.com/handle" className={`${inputCls("socialTwitter")} pl-9`} />
                </div>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input type="url" value={form.socialLinkedin} onChange={e => update("socialLinkedin", e.target.value)}
                    placeholder="linkedin.com/company/..." className={`${inputCls("socialLinkedin")} pl-9`} />
                </div>
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input type="url" value={form.socialInstagram} onChange={e => update("socialInstagram", e.target.value)}
                    placeholder="instagram.com/handle" className={`${inputCls("socialInstagram")} pl-9`} />
                </div>
              </div>
            </div>
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
