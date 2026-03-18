import { useState, useCallback, useRef } from "react";
import { Globe, Upload, FileText, AlertCircle, Loader2, Check, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { CompanyData, AnalysisResult } from "@/components/CompanyProfile";

const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];
const sectors = [
  "SaaS / B2B Software", "Fintech", "Health Tech", "Consumer / D2C",
  "AI / ML", "Climate Tech", "Marketplace", "Developer Tools", "Edtech", "Other",
];

interface OnboardingStepperProps {
  onComplete: (company: CompanyData, analysis: AnalysisResult) => void;
  onSkip: () => void;
}

export function OnboardingStepper({ onComplete, onSkip }: OnboardingStepperProps) {
  const [step, setStep] = useState(1);
  const [website, setWebsite] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [deckText, setDeckText] = useState("");
  const [stage, setStage] = useState("");
  const [sector, setSector] = useState("");
  const [mrr, setMrr] = useState("");
  const [burnRate, setBurnRate] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [websiteScraped, setWebsiteScraped] = useState(false);
  const [synced, setSynced] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrapeWebsite = async () => {
    if (!website.trim()) return;
    setIsProcessing(true);
    setError(null);
    setProcessStep("Scanning digital footprint...");
    try {
      const { data, error: scrapeError } = await supabase.functions.invoke("scrape-website", {
        body: { url: website.trim() },
      });
      if (scrapeError) throw scrapeError;
      setWebsiteScraped(true);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to scrape website");
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

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-company", {
        body: { websiteText: websiteMarkdown, deckText, companyName, stage, sector },
      });
      if (analysisError) throw analysisError;
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalysisResult(analysisData as AnalysisResult);
      // Pre-fill confirmed values
      if (analysisData?.metrics?.mrr?.value) setMrr(analysisData.metrics.mrr.value);
      if (analysisData?.metrics?.burnRate?.value) setBurnRate(analysisData.metrics.burnRate.value);
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
      const company: CompanyData = {
        name: companyName, stage, sector, subsectors: [], description: "", website, teamSize: "",
        businessModel: "", targetCustomer: "", hqLocation: "", competitors: [],
        uniqueValueProp: "", currentARR: "", yoyGrowth: "", totalHeadcount: "",
      };
      if (analysisResult) {
        onComplete(company, {
          ...analysisResult,
          metrics: {
            ...analysisResult.metrics,
            mrr: { value: mrr || analysisResult.metrics.mrr.value, confidence: "high" },
            burnRate: { value: burnRate || analysisResult.metrics.burnRate.value, confidence: "high" },
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
            {/* Header */}
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Welcome to Founder Copilot</h2>
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
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp" maxLength={100}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <Globe className="inline h-3 w-3 mr-1" />Website URL
                    </label>
                    <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourcompany.com"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30" />
                    <p className="text-[10px] text-muted-foreground">We'll scan your site for value prop, pricing, and positioning</p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <FileText className="inline h-3 w-3 mr-1" />Upload Your Pitch Deck
                    </label>
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 py-8 transition-colors hover:border-accent/40 cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">
                        {deckFile ? deckFile.name : "Drop PDF here or click to browse"}
                      </span>
                      {deckFile && deckText && <span className="text-[10px] text-success font-mono">✓ Text extracted</span>}
                      <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">AI will extract key metrics from your deck</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Stage</label>
                      <select value={stage} onChange={(e) => setStage(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
                        <option value="">Select stage</option>
                        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
                      <select value={sector} onChange={(e) => setSector(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
                        <option value="">Select sector</option>
                        {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <p className="text-xs text-muted-foreground">Confirm the metrics AI extracted. You can edit any value below.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">MRR</label>
                      <input type="text" value={mrr} onChange={(e) => setMrr(e.target.value)}
                        placeholder="e.g. $50K"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Burn Rate</label>
                      <input type="text" value={burnRate} onChange={(e) => setBurnRate(e.target.value)}
                        placeholder="e.g. $30K/mo"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Stage</label>
                      <select value={stage} onChange={(e) => setStage(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
                        <option value="">Select stage</option>
                        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
                      <select value={sector} onChange={(e) => setSector(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none">
                        <option value="">Select sector</option>
                        {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
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
              <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Skip for now
              </button>
              <div className="flex gap-2">
                {step > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>Back</Button>
                )}
                {step === 1 && (
                  <Button size="sm" disabled={!companyName.trim() || isProcessing} onClick={() => {
                    if (website.trim()) { scrapeWebsite(); } else { setStep(2); }
                  }}>
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {isProcessing ? processStep : "Continue"}
                  </Button>
                )}
                {step === 2 && (
                  <Button size="sm" disabled={isProcessing} onClick={runAnalysis}>
                    {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {isProcessing ? processStep : "Analyze & Continue"}
                  </Button>
                )}
                {step === 3 && (
                  <Button size="sm" onClick={finalize} className="gap-1.5">
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
