import { useState, useCallback, useRef, useEffect } from "react";
import { Globe, AlertCircle, Loader2, Check, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { normalizeSector } from "@/components/company-profile/sectorNormalization";
import { SmartSelect, AI_SUGGESTED_TEXT_CLASS } from "@/components/onboarding/SmartSelect";
import { SectorCombobox } from "@/components/onboarding/SectorCombobox";
import { EnhancedDropzone } from "@/components/onboarding/EnhancedDropzone";
import type { CompanyData, AnalysisResult } from "@/components/CompanyProfile";

import { SECTOR_TAXONOMY } from "@/components/company-profile/types";

const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];
const sectors = Object.keys(SECTOR_TAXONOMY);

/** Wait for the user to pause typing before calling Gemini/Clearbit (avoids guesses on partial names). */
const WEBSITE_GUESS_DEBOUNCE_MS = 700;
/** Minimum trimmed length before we auto-guess a URL (reduces junk matches on 2–3 character inputs). */
const MIN_COMPANY_NAME_LEN_FOR_URL_GUESS = 4;

/** Inline validation for company website (step 1). Returns null if OK. */
function getWebsiteUrlError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Enter your company website URL.";

  let toParse = trimmed;
  if (!/^https?:\/\//i.test(toParse)) {
    toParse = `https://${toParse}`;
  }

  try {
    const u = new URL(toParse);
    const host = u.hostname.toLowerCase();
    if (!host || host.length < 3) {
      return `"${trimmed}" is not a valid URL. Check the address and try again.`;
    }
    if (!host.includes(".")) {
      return "Use a full domain (for example yourcompany.com).";
    }
    const parts = host.split(".").filter(Boolean);
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2 || !/^[a-z0-9-]+$/i.test(tld)) {
      return `"${trimmed}" is not a valid URL. Check the address and try again.`;
    }
    if (host.includes(" ") || host.startsWith(".")) {
      return `"${trimmed}" is not a valid URL. Check the address and try again.`;
    }
    return null;
  } catch {
    return `"${trimmed}" is not a valid URL. Use a format like https://yourcompany.com.`;
  }
}

interface OnboardingStepperProps {
  onComplete: (company: CompanyData, analysis: AnalysisResult) => void;
  onSkip: () => void;
}

const PENDING_COMPANY_SEED_KEY = "pending-company-seed";

function readSeed() {
  try {
    const raw = localStorage.getItem(PENDING_COMPANY_SEED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

<<<<<<< HEAD
function clearSeed() {
  try {
    localStorage.removeItem(PENDING_COMPANY_SEED_KEY);
  } catch {}
}
=======
/** Skip auto-URL for gibberish / keyboard mash; still allows short real names (e.g. IBM). */
function looksLikePlausibleCompanyName(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  const compact = trimmed.replace(/\s/g, "");
  if (compact.length >= 5 && /^(.)\1+$/.test(compact)) return false;
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 5 && !/[aeiouy]/i.test(letters)) return false;
  return true;
}

function slugFromCompanyName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function primaryBrandFromHostname(host: string): string {
  return host.toLowerCase().replace(/^www\./, "").split(".")[0] || "";
}

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(Math.min(prev, row[j]), row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * True if the URL's registrable-looking label matches the company name closely enough
 * to accept a third-party guess (blocks unrelated megasites).
 * Short substring rules are strict so e.g. "dis" cannot match discord.com.
 */
function guessedUrlMatchesCompanyName(urlString: string, companyName: string): boolean {
  const trimmed = urlString.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    let s = trimmed;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    url = new URL(s);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  const brand = primaryBrandFromHostname(host);
  if (brand.length < 2) return false;

  const companySlug = normalizeLoose(companyName);
  const words = companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

  if (companySlug.length >= 2 && brand.length >= 2) {
    if (companySlug === brand) return true;
    if (companySlug.length >= 4 && brand.includes(companySlug)) return true;
    if (brand.length >= 4 && companySlug.includes(brand)) return true;
  }
  for (const w of words) {
    if (w.length >= 4 && brand.includes(w)) return true;
    if (brand.length >= 4 && w.includes(brand)) return true;
  }
  const minLen = Math.min(companySlug.length, brand.length);
  if (minLen >= 5) {
    const d = levenshtein(companySlug, brand);
    const maxDist = Math.max(1, Math.floor(minLen * 0.22));
    if (d <= maxDist) return true;
  }
  return false;
}

function clearbitCompanyNameMatchesQuery(query: string, resultName: string): boolean {
  const q = normalizeLoose(query);
  const n = normalizeLoose(resultName);
  if (q.length < 2 || n.length < 2) return false;
  // Short queries: only exact normalized matches (e.g. "IBM"), not substring hits on "Discord".
  if (q.length < 4) return q === n;
  if (n.includes(q) || q.includes(n)) return true;
  const minLen = Math.min(q.length, n.length);
  if (minLen >= 5) {
    const d = levenshtein(q, n);
    if (d <= Math.max(1, Math.floor(minLen * 0.28))) return true;
  }
  return false;
}

function extractUrlFromGeminiResponse(text: string): string | null {
  const t = text.trim();
  if (/^UNKNOWN$/i.test(t)) return null;
  const unfenced = t.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  const m = unfenced.match(/https?:\/\/[^\s"'<>[\]()]+/i);
  return m ? m[0].replace(/[,;.]+$/, "") : null;
}

function defaultWebsiteGuessFromCompanyName(companyName: string): string {
  if (!looksLikePlausibleCompanyName(companyName)) return "";
  const slug = slugFromCompanyName(companyName);
  if (slug.length < 2) return "";
  return `https://${slug}.com`;
}

export function OnboardingStepper({ onComplete, onSkip }: OnboardingStepperProps) {
  // Read seed on every mount (StrictMode-safe: don't remove in initializer)
  const [seed] = useState(readSeed);
>>>>>>> 161cd2090b521933223851841b228d151482ad85

export function OnboardingStepper({ onComplete, onSkip }: OnboardingStepperProps) {
  const [seed] = useState(readSeed);

  const [step, setStep] = useState(1);
  const [website, setWebsite] = useState(() => {
    if (seed?.websiteUrl?.trim()) return seed.websiteUrl;
    if (seed?.companyName) return defaultWebsiteGuessFromCompanyName(seed.companyName);
    return "";
  });
  const [companyName, setCompanyName] = useState(seed?.companyName || "");
  const [aiGuessedFields, setAiGuessedFields] = useState<string[]>(seed?.aiGuessed || []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState("");
  const websiteGuessAttemptedForRef = useRef<string | null>(null);

  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [deckText, setDeckText] = useState(seed?.deckText || "");
  const [stage, setStage] = useState(seed?.stage || "");
  const [sector, setSector] = useState(seed?.sectors?.[0] || "");
  const [mrr, setMrr] = useState("");
  const [momGrowth, setMomGrowth] = useState("");
  const [burnRate, setBurnRate] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [metricMode, setMetricMode] = useState<"monthly" | "annual">("monthly");
  const [error, setError] = useState<string | null>(null);
  const [websiteScraped, setWebsiteScraped] = useState(false);
  const [synced, setSynced] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [faviconError, setFaviconError] = useState(false);
  const [predictedStage, setPredictedStage] = useState("");
  const [predictedSector, setPredictedSector] = useState("");
  const [shakeStep2, setShakeStep2] = useState(false);

  const [shakeStep3, setShakeStep3] = useState(false);
  const [websiteUrlError, setWebsiteUrlError] = useState<string | null>(null);

  const [aiMetricHighlight, setAiMetricHighlight] = useState({
    stage: false,
    sector: false,
    mrr: false,
    momGrowth: false,
    burnRate: false,
    headcount: false,
  });

  const companyNameRef = useRef(companyName);
  const websiteRef = useRef(website);
  const stepRef = useRef(step);
  companyNameRef.current = companyName;
  websiteRef.current = website;
  stepRef.current = step;

  // Drop an AI-filled URL if the user keeps typing and it no longer matches the company name.
  useEffect(() => {
    const nameTrim = companyName.trim();
    if (!website.trim() || !aiGuessedFields.includes("websiteUrl")) return;
    if (guessedUrlMatchesCompanyName(website, nameTrim)) return;
    setWebsite("");
    setAiGuessedFields((prev) => prev.filter((f) => f !== "websiteUrl"));
    websiteGuessAttemptedForRef.current = null;
  }, [companyName, website, aiGuessedFields]);

  useEffect(() => {
    const nameTrim = companyName.trim();
    if (!nameTrim || website || step !== 1) return;
    if (!looksLikePlausibleCompanyName(nameTrim)) return;
    if (nameTrim.length < MIN_COMPANY_NAME_LEN_FOR_URL_GUESS) return;

    const timer = window.setTimeout(() => {
      const n = companyNameRef.current.trim();
      if (
        !n ||
        websiteRef.current.trim() ||
        stepRef.current !== 1 ||
        !looksLikePlausibleCompanyName(n) ||
        n.length < MIN_COMPANY_NAME_LEN_FOR_URL_GUESS
      ) {
        return;
      }

      const key = n.toLowerCase();
      if (websiteGuessAttemptedForRef.current === key) return;
      websiteGuessAttemptedForRef.current = key;

      const applyGuess = (rawUrl: string) => {
        const u = rawUrl.trim();
        if (!u || getWebsiteUrlError(u) !== null) return false;
        if (!guessedUrlMatchesCompanyName(u, n)) return false;
        setWebsite(u);
        setAiGuessedFields((prev) => Array.from(new Set([...prev, "websiteUrl"])));
        return true;
      };

      const guessUrl = async () => {
        setIsProcessing(true);
        setProcessStep("Finding your company website...");
        try {
          const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
          if (geminiKey) {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          text: `You map a company name to its official primary website domain.

Company name: "${n}"

Rules:
- Reply UNKNOWN unless this is a specific real company you recognize and can tie to one official site.
- The site's first hostname label must clearly match the company name (not a substring coincidence on a different brand).
- Never return social networks, app stores, Wikipedia, Crunchbase, or unrelated megabrands.
- If unsure, reply exactly: UNKNOWN
- If you know the company, reply with one https URL only — no markdown, quotes, or explanation.`,
                        },
                      ],
                    },
                  ],
                }),
              }
            );
            if (res.ok) {
              const data = await res.json();
              const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
              const extracted = extractUrlFromGeminiResponse(text);
              if (extracted && applyGuess(extracted)) return;
            }
          }

          const bgRes = await fetch(
            `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(n)}`
          );
          if (bgRes.ok) {
            const bgData: { name?: string; domain?: string }[] = await bgRes.json();
            if (Array.isArray(bgData)) {
              for (const row of bgData) {
                const domain = row.domain?.trim();
                const legalName = row.name?.trim() ?? "";
                if (!domain || !legalName) continue;
                if (!clearbitCompanyNameMatchesQuery(n, legalName)) continue;
                const candidate = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
                if (applyGuess(candidate)) return;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to guess website URL", e);
        } finally {
          setIsProcessing(false);
          setProcessStep("");
        }
      };

      void guessUrl();
    }, WEBSITE_GUESS_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [companyName, website, step]);

  const clearAiMetric = useCallback((key: keyof typeof aiMetricHighlight) => {
    setAiMetricHighlight((h) => ({ ...h, [key]: false }));
  }, []);

  const handleSkip = useCallback(() => {
    clearSeed();
    onSkip();
  }, [onSkip]);

  const validateStep3 = (): boolean => {
    const missing: string[] = [];
    if (!stage) missing.push("Stage");
    if (!sector) missing.push("Sector");
    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "Missing Required Fields",
        description: `Please select: ${missing.join(", ")}`,
      });
      setShakeStep3(true);
      setTimeout(() => setShakeStep3(false), 600);
      return false;
    }
    return true;
  };

  const faviconUrl = useMemo(() => {
    if (!website.trim()) return null;
    try {
      const url = new URL(website.trim().startsWith("http") ? website.trim() : `https://${website.trim()}`);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
    } catch {
      return null;
    }
  }, [website]);

  // Reset favicon error when URL changes
  const prevFaviconUrl = useRef(faviconUrl);
  if (prevFaviconUrl.current !== faviconUrl) {
    prevFaviconUrl.current = faviconUrl;
    setFaviconError(false);
  }

  // Mock predictive categorization based on website
  const runPredictiveFetch = useCallback(() => {
    // Mock function - returns predicted values from web scrape
    setPredictedStage("Series B");
    setPredictedSector("Construction & Real Estate");
  }, []);

  const isValidUrl = (url: string) => getWebsiteUrlError(url) === null;

  const scrapeWebsite = async () => {
    const urlErr = getWebsiteUrlError(website);
    if (urlErr) {
      setWebsiteUrlError(urlErr);
      return;
    }
    setWebsiteUrlError(null);
    setIsProcessing(true);
    setError(null);
    setProcessStep("Scanning digital footprint...");
    try {
      if (isValidUrl(website.trim())) {
        const { data, error: scrapeError } = await supabase.functions.invoke("scrape-website", {
          body: { url: website.trim() },
        });
        if (scrapeError) {
          console.warn("Website scrape failed, continuing:", scrapeError);
        } else {
          setWebsiteScraped(true);
        }
      } else {
        console.warn("Skipping scrape: URL has no valid TLD:", website);
      }
      runPredictiveFetch();
      setStep(2);
    } catch (e) {
      // Still allow the user to proceed even if scraping fails
      console.warn("Website scrape error, continuing:", e);
      runPredictiveFetch();
      setStep(2);
    } finally {
      setIsProcessing(false);
      setProcessStep("");
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".txt")) {
      setError("Please upload a PDF or TXT file.");
      return;
    }
    setError(null);
    setDeckFile(file);
    try {
      if (name.endsWith(".txt")) {
        setDeckText(await file.text());
      } else {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item: any) => ("str" in item ? item.str : "")).join(" "));
        }
        setDeckText(pages.join("\n\n"));
      }
    } catch {
      setError("Failed to read file.");
    }
  }, []);

  const runAnalysis = async () => {
    setIsProcessing(true);
    setError(null);
    setProcessStep("AI is extracting your vital signs...");
    try {
      let websiteMarkdown = "";
      if (website.trim()) {
        const { data } = await supabase.functions.invoke("scrape-website", {
          body: { url: website.trim() },
        });
        websiteMarkdown = data?.markdown || "";
      }

      // Skip AI analysis if there's no content to analyze
      if (!websiteMarkdown && !deckText) {
        setAnalysisResult({
          healthScore: 0,
          executiveSummary: "",
          header: "",
          valueProposition: "",
          metricTable: [],
          metrics: {
            mrr: { value: "", confidence: "low" },
            burnRate: { value: "", confidence: "low" },
            runway: { value: "", confidence: "low" },
            ltv: { value: "", confidence: "low" },
            cac: { value: "", confidence: "low" },
          },
          scrapedHeader: "",
          scrapedValueProp: "",
          scrapedPricing: "",
        } as AnalysisResult);
        setStep(3);
        return;
      }

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-company", {
        body: { websiteText: websiteMarkdown, deckText, companyName, stage, sector },
      });
      if (analysisError) throw analysisError;
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalysisResult(analysisData as AnalysisResult);

      // Normalize and apply sector from AI
      const normalized = normalizeSector(
        analysisData?.aiExtracted?.sector || analysisData?.sectorMapping?.sector,
        analysisData?.sectorMapping?.subTag,
        analysisData?.sectorMapping?.keywords
      );
      if (normalized.sector) {
        setSector(normalized.sector);
        console.log(`[Onboarding] Sector normalized: "${normalized.sector}" from AI raw: "${analysisData?.aiExtracted?.sector}"`);
      }

      // Pre-fill confirmed values (sanitize nulls); purple until user edits
      const mrrVal = analysisData?.metrics?.mrr?.value;
      if (mrrVal && mrrVal !== "null") setMrr(mrrVal);
      const headcountVal = analysisData?.aiExtracted?.totalHeadcount;
      if (headcountVal && headcountVal !== "null") setHeadcount(headcountVal);
      const burnVal = analysisData?.metrics?.burnRate?.value;
      if (burnVal && burnVal !== "null") setBurnRate(burnVal);
      const momVal = analysisData?.aiExtracted?.momGrowth;
      if (momVal && momVal !== "null") setMomGrowth(momVal);

      setAiMetricHighlight((h) => ({
        ...h,
        ...(normalized.sector ? { sector: true } : {}),
        ...(mrrVal && mrrVal !== "null" ? { mrr: true } : {}),
        ...(headcountVal && headcountVal !== "null" ? { headcount: true } : {}),
        ...(burnVal && burnVal !== "null" ? { burnRate: true } : {}),
        ...(momVal && momVal !== "null" ? { momGrowth: true } : {}),
      }));
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsProcessing(false);
      setProcessStep("");
    }
  };

  const finalize = () => {
    setSynced(true);
    setTimeout(() => {
      // Normalize sector one more time to ensure consistency
      const normalized = normalizeSector(
        sector || analysisResult?.aiExtracted?.sector,
        analysisResult?.sectorMapping?.subTag,
        analysisResult?.sectorMapping?.keywords
      );
      const finalSector = normalized.sector || sector;
      const finalSubsectors = normalized.subsectors;

      console.log(`[Onboarding Finalize] Sector: "${finalSector}" | Subsectors: [${finalSubsectors.join(", ")}]`);

      const sanitize = (v: string | null | undefined) => (!v || v === "null") ? "" : v;

      const company: CompanyData = {
        name: companyName, stage, sector: finalSector, subsectors: finalSubsectors,
        description: sanitize(analysisResult?.aiExtracted?.description),
        website,
        teamSize: sanitize(analysisResult?.agentData?.teamSize),
        businessModel: sanitize(analysisResult?.aiExtracted?.businessModel) ? [sanitize(analysisResult?.aiExtracted?.businessModel)] : [],
        targetCustomer: sanitize(analysisResult?.aiExtracted?.targetCustomer) ? [sanitize(analysisResult?.aiExtracted?.targetCustomer)] : [],
        hqLocation: sanitize(analysisResult?.aiExtracted?.hqLocation),
        competitors: analysisResult?.aiExtracted?.competitors?.filter(Boolean) || [],
        uniqueValueProp: sanitize(analysisResult?.aiExtracted?.uniqueValueProp),
        currentARR: sanitize(analysisResult?.aiExtracted?.currentARR),
        yoyGrowth: sanitize(analysisResult?.aiExtracted?.yoyGrowth),
        totalHeadcount: sanitize(headcount) || sanitize(analysisResult?.aiExtracted?.totalHeadcount),
        socialTwitter: "", socialLinkedin: "", socialInstagram: "",
        burnRate: sanitize(burnRate), nrr: "", cac: "", ltv: "",
        momGrowth: sanitize(momGrowth),
      };
      if (analysisResult) {
        clearSeed();
        onComplete(company, {
          ...analysisResult,
          metrics: {
            ...analysisResult.metrics,
            mrr: { value: sanitize(mrr) || sanitize(analysisResult.metrics.mrr.value), confidence: "high" },
            burnRate: { value: sanitize(burnRate) || sanitize(analysisResult.metrics.burnRate.value), confidence: "high" },
          },
        });
      }
    }, 1800);
  };

  const steps = [
    { num: 1, label: "Digital Footprint" },
    { num: 2, label: "The Pitch" },
    { num: 3, label: "Vital Signs" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-lg">
        {/* Synced animation */}
        {synced && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center animate-pulse">
                <Sparkles className="h-10 w-10 text-success" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-success/30 animate-ping" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Data Synced</h2>
            <p className="text-sm text-muted-foreground">Your dashboard is ready.</p>
          </div>
        )}

        {!synced && (
          <>
            {/* Brand continuity — favicon + company name */}
            {step > 1 && companyName.trim() && (
              <div className="flex items-center gap-2.5 px-6 pt-4 pb-0 animate-fade-in">
                {faviconUrl && !faviconError && (
                  <img
                    src={faviconUrl}
                    alt={`${companyName} icon`}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-md shadow-sm object-contain"
                    onError={() => setFaviconError(true)}
                  />
                )}
                <span className="text-sm font-semibold text-foreground">{companyName}</span>
              </div>
            )}

            {/* Header */}
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Welcome to Vekta. Let's sync your company.</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Let's set up your company profile in 3 quick steps</p>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
              {steps.map((s, i) => (
                <div key={s.num} className="flex items-center gap-2 flex-1">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                    step > s.num ? "bg-success text-success-foreground" :
                    step === s.num ? "bg-accent text-accent-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {step > s.num ? <Check className="h-3 w-3" /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="px-6 py-5 space-y-4">
              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Company Name *</label>
                    <input type="text" value={companyName} onChange={(e) => { setCompanyName(e.target.value); setAiGuessedFields(prev => prev.filter(f => f !== 'companyName')); }}
                      placeholder="Acme Corp" maxLength={100}
                      className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors ${aiGuessedFields.includes("companyName") ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"}`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <Globe className="inline h-3 w-3 mr-1" />Website URL *
                    </label>
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => {
                        setWebsite(e.target.value);
                        setWebsiteUrlError(null);
                        websiteGuessAttemptedForRef.current = null;
                        setAiGuessedFields((prev) => prev.filter((f) => f !== "websiteUrl"));
                      }}
                      onBlur={() => {
                        if (!website.trim()) {
                          setWebsiteUrlError(null);
                          return;
                        }
                        const err = getWebsiteUrlError(website);
                        setWebsiteUrlError(err);
                      }}
                      placeholder="https://yourcompany.com"
                      aria-invalid={!!websiteUrlError}
                      className={`w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-colors ${
                        websiteUrlError
                          ? "border-destructive focus:ring-destructive/25"
                          : "border-input focus:ring-ring/30"
                      } ${aiGuessedFields.includes("websiteUrl") ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"}`}
                    />
                    {websiteUrlError ? (
                      <p className="text-xs text-destructive" role="alert">
                        {websiteUrlError}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        We'll scan your site for value prop, pricing, and positioning
                      </p>
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Upload Your Pitch Deck
                    </label>
                    <EnhancedDropzone
                      file={deckFile}
                      hasExtractedText={!!deckText}
                      onFileSelect={handleFileSelect}
                      onRemove={() => { setDeckFile(null); setDeckText(""); }}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                   <p className="text-xs text-muted-foreground">Confirm the metrics AI extracted. You can edit any value below.</p>
                   <div className="grid grid-cols-2 gap-3">
                     <SmartSelect
                       label="Stage *"
                       value={stage}
                       onChange={setStage}
                       onUserEdited={() => clearAiMetric("stage")}
                       options={stages}
                       predictedValue={predictedStage}
                       highlightAi={aiMetricHighlight.stage}
                       onAiAutofill={() => setAiMetricHighlight((h) => ({ ...h, stage: true }))}
                     />
                     <SectorCombobox
                       value={sector}
                       onChange={setSector}
                       predictedValue={predictedSector}
                       highlightAi={aiMetricHighlight.sector}
                       onAiAutofill={() => setAiMetricHighlight((h) => ({ ...h, sector: true }))}
                       onUserEdited={() => clearAiMetric("sector")}
                     />
                   </div>

                   {/* Financials section */}
                   <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                     <div className="flex items-center justify-between">
                       <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-bold">Financials</span>
                       <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-medium">
                         <button
                           type="button"
                           onClick={() => setMetricMode("monthly")}
                           className={`px-3 py-1 transition-colors ${metricMode === "monthly" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                         >Monthly</button>
                         <button
                           type="button"
                           onClick={() => setMetricMode("annual")}
                           className={`px-3 py-1 transition-colors ${metricMode === "annual" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                         >Annual</button>
                       </div>
                     </div>
                     <div className="grid grid-cols-3 gap-3">
                       <div className="space-y-1.5">
                         <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                           {metricMode === "monthly" ? "MRR" : "ARR"}
                         </label>
                         <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                           <input
                             type="text"
                             value={mrr}
                             onChange={(e) => {
                               setMrr(e.target.value);
                               clearAiMetric("mrr");
                             }}
                             placeholder={metricMode === "monthly" ? "e.g. 50K" : "e.g. 600K"}
                             className={`w-full rounded-lg border border-input bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                               aiMetricHighlight.mrr ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
                             }`}
                           />
                         </div>
                       </div>
                       <div className="space-y-1.5">
                         <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                           {metricMode === "monthly" ? "MoM Growth" : "YoY Growth"}
                         </label>
                         <div className="relative">
                           <input
                             type="text"
                             value={momGrowth}
                             onChange={(e) => {
                               setMomGrowth(e.target.value);
                               clearAiMetric("momGrowth");
                             }}
                             placeholder="e.g. 8"
                             className={`w-full rounded-lg border border-input bg-background px-3 py-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                               aiMetricHighlight.momGrowth ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
                             }`}
                           />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                         </div>
                       </div>
                       <div className="space-y-1.5">
                         <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                           {metricMode === "monthly" ? "Monthly Burn" : "Annual Burn"}
                         </label>
                         <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                           <input
                             type="text"
                             value={burnRate}
                             onChange={(e) => {
                               setBurnRate(e.target.value);
                               clearAiMetric("burnRate");
                             }}
                             placeholder={metricMode === "monthly" ? "e.g. 50K" : "e.g. 600K"}
                             className={`w-full rounded-lg border border-input bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                               aiMetricHighlight.burnRate ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
                             }`}
                           />
                         </div>
                       </div>
                     </div>
                   </div>

                   {/* Headcount */}
                   <div className="space-y-1.5">
                     <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Headcount</label>
                     <input
                       type="text"
                       value={headcount}
                       onChange={(e) => {
                         setHeadcount(e.target.value);
                         clearAiMetric("headcount");
                       }}
                       placeholder="e.g. 25"
                       className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 ${
                         aiMetricHighlight.headcount ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
                       }`}
                     />
                    </div>
                   {/* Intelligence engine nudge — shown when any metric field is blank */}
                   {(!mrr.trim() || !momGrowth.trim() || !burnRate.trim() || !headcount.trim()) && (
                     <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5">
                       <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                       <span className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                         The more metrics you provide, the better the intelligence engine performs.
                       </span>
                     </div>
                   )}
                   {analysisResult?.healthScore && (
                     <div className="flex items-center gap-3 rounded-lg bg-success/5 border border-success/20 px-4 py-3">
                       <Check className="h-4 w-4 text-success" />
                       <span className="text-xs text-foreground">Health Score: <strong>{analysisResult.healthScore}/100</strong></span>
                     </div>
                   )}
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <button onClick={handleSkip} className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                Skip for now
              </button>
              <div className="flex gap-2">
                {step > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>Back</Button>
                )}
                {step === 1 && (
                  <Button size="sm" disabled={!companyName.trim() || !website.trim() || isProcessing} onClick={() => {
                    const err = getWebsiteUrlError(website);
                    if (err) {
                      setWebsiteUrlError(err);
                      return;
                    }
                    setWebsiteUrlError(null);
                    scrapeWebsite();
                  }}>
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {isProcessing ? processStep : "Continue"}
                  </Button>
                )}
                {step === 2 && !deckFile && (
                  <Button variant="outline" size="sm" disabled={isProcessing} onClick={() => runAnalysis()}>
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {isProcessing ? processStep : "Continue with Web Data"}
                  </Button>
                )}
                {step === 2 && deckFile && (
                  <Button size="sm" disabled={isProcessing} onClick={() => runAnalysis()} className="animate-pulse hover:animate-none">
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {isProcessing ? processStep : "Analyze Deck & Continue"}
                  </Button>
                )}
                {step === 3 && (
                  <Button size="sm" onClick={() => { if (validateStep3()) finalize(); }} className={`gap-1.5 ${shakeStep3 ? "animate-shake" : ""}`}>
                    <Sparkles className="h-3.5 w-3.5" /> Sync & Launch Dashboard
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
