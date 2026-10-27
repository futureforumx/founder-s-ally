import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCompanyMetrics } from "@/hooks/useCompanyMetrics";
import { FounderMetricsSetup } from "@/components/data-room/FounderMetricsSetup";
import { parseSmartNumber, smartBlurCurrency } from "@/components/data-room/metricsFormatting";
import { uploadR2UserAsset } from "@/lib/r2UserAssets";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "./types";

interface StepInvestorMaterialsProps {
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  meta?: { eyebrow?: string; title?: string; subtitle?: string };
}

const DOCUMENT_EXTENSIONS = ["pdf", "ppt", "pptx", "doc", "docx", "txt", "md"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepInvestorMaterials({ state, update, onBack, onFinish, saving, meta }: StepInvestorMaterialsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [showSkipHint, setShowSkipHint] = useState(false);
  const [requiredReady, setRequiredReady] = useState(false);
  const { metrics, update: updateMetrics, saveState, retry } = useCompanyMetrics();

  const initialValues = useMemo(() => {
    const revenue = parseSmartNumber(state.recurringRevenue);
    const periodIsArr = state.recurringRevenuePeriod === "arr";
    const inferredModel = state.revenueBand.toLowerCase().includes("pre-revenue")
      ? "pre_revenue"
      : state.sectors.some((sector) => /marketplace|fintech/i.test(sector))
        ? "marketplace"
        : "saas";
    return {
      businessModel: inferredModel as "saas" | "usage" | "marketplace" | "pre_revenue",
      arr: revenue ? smartBlurCurrency(String(periodIsArr ? revenue : revenue * 12)) : "",
      mrr: revenue ? smartBlurCurrency(String(periodIsArr ? revenue / 12 : revenue)) : "",
      monthlyBurnRate: state.burnRate ? smartBlurCurrency(String(parseSmartNumber(state.burnRate))) : "",
      cac: state.cac ? smartBlurCurrency(String(parseSmartNumber(state.cac))) : "",
      ltv: state.ltv ? smartBlurCurrency(String(parseSmartNumber(state.ltv))) : "",
      headcount: state.headcount || (state.cofounderCount === "Solo" ? "1" : state.cofounderCount && /^\d+$/.test(state.cofounderCount) ? state.cofounderCount : ""),
    };
  }, [state.burnRate, state.cac, state.cofounderCount, state.headcount, state.ltv, state.recurringRevenue, state.recurringRevenuePeriod, state.revenueBand, state.sectors]);

  const handleSkip = () => {
    setShowSkipHint(true);
    onFinish();
  };

  const handleFile = async (file: File) => {
    if (!state.stage.trim()) {
      toast({ title: "Fundraising round required", description: "Set your fundraising round before uploading investor materials.", variant: "destructive" });
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!DOCUMENT_EXTENSIONS.includes(extension)) {
      toast({ title: "Unsupported document", description: "Upload a PDF, PowerPoint, Word document, TXT, or Markdown file.", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File is too large", description: "Choose a document no larger than 25 MB.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setFileSize(file.size);
    try {
      const uploaded = await uploadR2UserAsset("pitch-deck", file);
      update({ deckFileName: file.name, deckFileUrl: uploaded.url });
      toast({ title: "Material uploaded", description: `${file.name} is ready.` });
    } catch (error) {
      setFileSize(null);
      toast({ title: "Couldn't upload material", description: error instanceof Error ? error.message : "Try uploading again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clearFile = () => {
    setFileSize(null);
    update({ deckFileName: "", deckFileUrl: "", deckText: "" });
  };

  const legacyValueChange = (field: keyof typeof metrics, value: string) => {
    if (field === "arr") update({ recurringRevenue: value, recurringRevenuePeriod: "arr" });
    if (field === "mrr") update({ recurringRevenue: value, recurringRevenuePeriod: "mrr" });
    if (field === "monthlyBurnRate") update({ burnRate: value });
    if (field === "cac") update({ cac: value });
    if (field === "ltv") update({ ltv: value });
    if (field === "headcount") update({ headcount: value });
  };

  const uploadPanel = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="font-sans text-xs font-semibold text-neutral-300">{meta?.eyebrow ?? "Investor materials"} · Pitch deck or one-pager</label>
        <span className="font-sans text-[10px] text-neutral-500">Up to 25 MB</span>
      </div>
      {state.deckFileUrl || isUploading ? (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-emerald-400">{isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-100">{isUploading ? "Uploading document…" : state.deckFileName}</p>
            <p className="mt-0.5 text-[10px] text-neutral-500">{fileSize ? formatFileSize(fileSize) : "Stored securely"}</p>
          </div>
          {!isUploading && <Button type="button" variant="ghost" size="icon" onClick={clearFile} aria-label="Remove uploaded material"><X className="h-4 w-4" /></Button>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragOver(false); const file = event.dataTransfer.files?.[0]; if (file) void handleFile(file); }}
          className={cn("flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center transition-colors", isDragOver ? "border-emerald-600 bg-emerald-950/30" : "border-neutral-700 bg-neutral-900/20 hover:border-emerald-800 hover:bg-neutral-900/40")}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-emerald-400"><Upload className="h-4 w-4" /></span>
          <p className="mt-3 text-sm font-semibold text-neutral-100">Drop your file here</p>
          <p className="mt-1 text-[11px] text-neutral-500">or click to browse · PDF, PowerPoint, Word, TXT, or MD</p>
        </button>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="min-w-0 w-full">
      <FounderMetricsSetup
        metrics={metrics}
        update={updateMetrics}
        saveState={saveState}
        retry={retry}
        initialValues={initialValues}
        onLegacyValueChange={legacyValueChange}
        onRequiredValidityChange={setRequiredReady}
        topContent={uploadPanel}
      />

      {showSkipHint && <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3.5 py-2.5"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><p className="text-[11px] leading-relaxed text-neutral-300">The more metrics, the better the matches.</p></div>}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving || isUploading} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving || isUploading}>Skip for now</Button>
          <Button type="button" onClick={onFinish} disabled={saving || isUploading || !requiredReady} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Finish setup {!saving && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
