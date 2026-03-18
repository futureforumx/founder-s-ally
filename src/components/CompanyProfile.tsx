import { useState, useCallback, useRef, useEffect } from "react";
import { Building2, Globe, Upload, FileText, AlertCircle, Loader2, Check, ChevronDown, ChevronUp, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];
const sectors = [
  "SaaS / B2B Software", "Fintech", "Health Tech", "Consumer / D2C",
  "AI / ML", "Climate Tech", "Marketplace", "Developer Tools", "Edtech", "Other",
];

export interface CompanyData {
  name: string;
  stage: string;
  sector: string;
  description: string;
  website: string;
  teamSize: string;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface MetricWithConfidence {
  value: string | null;
  confidence: ConfidenceLevel;
}

export interface AnalysisResult {
  header: string;
  valueProposition: string;
  pricingStructure?: string;
  executiveSummary: string;
  healthScore: number;
  metrics: {
    mrr: MetricWithConfidence;
    burnRate: MetricWithConfidence;
    cac: MetricWithConfidence;
    ltv: MetricWithConfidence;
    runway: MetricWithConfidence;
  };
  metricTable: {
    metric: string;
    value: string;
    benchmark: string;
    status: "healthy" | "warning" | "critical";
    confidence: ConfidenceLevel;
  }[];
  agentData?: {
    teamSize?: string;
    lastFunding?: string;
    fundingAmount?: string;
    sources: string[];
  };
}

interface CompanyProfileProps {
  onSave?: (data: CompanyData) => void;
  onAnalysis?: (result: AnalysisResult) => void;
}

export function CompanyProfile({ onSave, onAnalysis }: CompanyProfileProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [form, setForm] = useState<CompanyData>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { name: parsed.name || "", stage: parsed.stage || "", sector: parsed.sector || "", description: parsed.description || "", website: parsed.website || "", teamSize: parsed.teamSize || "" };
      }
    } catch {}
    return { name: "", stage: "", sector: "", description: "", website: "", teamSize: "" };
  });
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [deckText, setDeckText] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("company-logo-url"); } catch { return null; }
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save form to localStorage with debounce
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem("company-profile", JSON.stringify(form));
        if (form.name) {
          setSaveIndicator("Saved");
          setTimeout(() => setSaveIndicator(null), 1500);
        }
      } catch {}
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form]);

  // Persist logo URL
  useEffect(() => {
    try {
      if (logoUrl) localStorage.setItem("company-logo-url", logoUrl);
      else localStorage.removeItem("company-logo-url");
    } catch {}
  }, [logoUrl]);

  // Notify parent on mount if we have saved data
  useEffect(() => {
    if (form.name) {
      onSave?.(form);
      // Also restore analysis if available
      try {
        const savedAnalysis = localStorage.getItem("company-analysis");
        if (savedAnalysis) {
          const parsed = JSON.parse(savedAnalysis);
          onAnalysis?.(parsed);
          setAnalysisComplete(true);
          setIsExpanded(false);
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
    } finally {
      setUploadingLogo(false);
    }
  };

  const update = (field: keyof CompanyData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setAnalysisComplete(false);
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".txt")) {
      setError("Please upload a PDF or TXT file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum 50 MB.");
      return;
    }
    setError(null);
    setDeckFile(file);

    // Extract text
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
          const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
          pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${text}`);
        }
        setDeckText(pages.join("\n\n"));
      }
    } catch {
      setError("Failed to read file. Try a different format.");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleAnalyze = async () => {
    if (!form.name.trim()) { setError("Company name is required."); return; }
    if (!form.website.trim() && !deckText) { setError("Provide a website URL or upload a pitch deck."); return; }

    setIsAnalyzing(true);
    setError(null);
    let websiteMarkdown = "";

    try {
      // Step 1: Scrape website if provided
      if (form.website.trim()) {
        setAnalyzeStep("Scraping website...");
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("scrape-website", {
          body: { url: form.website.trim() },
        });
        if (scrapeError) {
          console.error("Scrape error:", scrapeError);
        } else if (scrapeData?.markdown) {
          websiteMarkdown = scrapeData.markdown;
        }
      }

      // Step 2: AI analysis
      setAnalyzeStep("Running AI analysis...");
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-company", {
        body: {
          websiteText: websiteMarkdown,
          deckText,
          companyName: form.name,
          stage: form.stage,
          sector: form.sector,
        },
      });

      if (analysisError) throw new Error(analysisError.message || "Analysis failed");
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalysisComplete(true);
      setIsExpanded(false);
      onSave?.(form);
      onAnalysis?.(analysisData as AnalysisResult);
      try { localStorage.setItem("company-analysis", JSON.stringify(analysisData)); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStep("");
    }
  };

  const canAnalyze = form.name.trim() && (form.website.trim() || deckText);

  return (
    <div className="surface-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 overflow-hidden group transition-colors hover:bg-accent/20"
            title="Upload logo"
          >
            {uploadingLogo ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : logoUrl ? (
              <>
                <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-3.5 w-3.5 text-foreground" />
                </div>
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4 text-accent group-hover:hidden" />
                <Camera className="h-4 w-4 text-accent hidden group-hover:block" />
              </>
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
          />
          <div className="text-left">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {form.name || "Company Profile"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {form.stage && form.sector
                ? `${form.stage} · ${form.sector}`
                : "Add your company details to run AI analysis"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysisComplete && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-success">
              <Check className="h-3 w-3" /> Analyzed
            </span>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
          {/* Row 1: Name + Stage + Sector */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Company Name *</label>
              <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                placeholder="Acme Corp" maxLength={100}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Stage</label>
              <select value={form.stage} onChange={(e) => update("stage", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors appearance-none">
                <option value="" disabled>Select stage</option>
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
              <select value={form.sector} onChange={(e) => update("sector", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors appearance-none">
                <option value="" disabled>Select sector</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Website URL */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Globe className="inline h-3 w-3 mr-1" />Website URL
            </label>
            <input type="url" value={form.website} onChange={(e) => update("website", e.target.value)}
              placeholder="https://acme.com" maxLength={255}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors" />
            <p className="text-[10px] text-muted-foreground">We'll scrape your site for value prop, pricing, and header info</p>
          </div>

          {/* Row 3: Pitch Deck Upload */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <FileText className="inline h-3 w-3 mr-1" />Pitch Deck (PDF)
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex items-center justify-between rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-3 transition-colors hover:border-accent/40"
            >
              <div className="flex items-center gap-3">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {deckFile ? deckFile.name : "Drop PDF here or browse"}
                </span>
                {deckFile && deckText && (
                  <span className="text-[10px] text-success font-mono">✓ Extracted</span>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              <button onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/80">
                Browse
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-muted-foreground">
              {isAnalyzing ? analyzeStep : "AI will extract metrics and generate an executive summary"}
            </p>
            <button onClick={handleAnalyze} disabled={!canAnalyze || isAnalyzing}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed">
              {isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
