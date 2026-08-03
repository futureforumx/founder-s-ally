import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
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

function MetricField({ id, label, value, placeholder, prefix = "$", onChange }: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  prefix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(prefix ? /[^0-9.,kmbKMB]/g : /[^0-9]/g, ""))}
          placeholder={placeholder}
          inputMode="decimal"
          className={cn("h-11 bg-background/70 text-sm", prefix && "pl-7")}
        />
      </div>
    </div>
  );
}

export function StepInvestorMaterials({ state, update, onBack, onFinish, saving, meta }: StepInvestorMaterialsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);

  const handleFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!DOCUMENT_EXTENSIONS.includes(extension)) {
      toast({ title: "Unsupported document", description: "Upload a PDF, PowerPoint, Word document, TXT, or Markdown file.", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File is too large", description: "Choose a document under 50 MB.", variant: "destructive" });
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

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="min-w-0 w-full">
      <div className="mb-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{meta?.eyebrow ?? "Investor materials"}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{meta?.title ?? "Add the numbers investors ask for"}</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{meta?.subtitle ?? "Upload your latest material and add a few headline metrics. Everything on this step is optional."}</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pitch deck or one-pager</label>
            <span className="text-[10px] text-muted-foreground">Up to 50 MB</span>
          </div>
          {state.deckFileUrl || isUploading ? (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-card text-primary">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{isUploading ? "Uploading document…" : state.deckFileName}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{fileSize ? formatFileSize(fileSize) : "Stored securely"}</p>
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
              className={cn("flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors", isDragOver ? "border-primary bg-primary/10" : "border-border/80 bg-background/35 hover:border-primary/45 hover:bg-muted/20")}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm"><Upload className="h-4 w-4" /></span>
              <p className="mt-3 text-sm font-semibold text-foreground">Drop your file here</p>
              <p className="mt-1 text-[11px] text-muted-foreground">or click to browse · PDF, PowerPoint, Word, TXT, or MD</p>
            </button>
          )}
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} />
        </div>

        <div className="h-px bg-border/70" />

        <fieldset>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Headline metrics</legend>
            <div className="flex rounded-lg border border-border bg-background/60 p-1" aria-label="Recurring revenue period">
              {(["mrr", "arr"] as const).map((period) => (
                <button key={period} type="button" onClick={() => update({ recurringRevenuePeriod: period })} className={cn("rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors", state.recurringRevenuePeriod === period ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{period}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricField id="onboarding-recurring-revenue" label={state.recurringRevenuePeriod.toUpperCase()} value={state.recurringRevenue} placeholder={state.recurringRevenuePeriod === "mrr" ? "50k" : "600k"} onChange={(recurringRevenue) => update({ recurringRevenue })} />
            <MetricField id="onboarding-burn" label="Burn rate" value={state.burnRate} placeholder="75k" onChange={(burnRate) => update({ burnRate })} />
            <MetricField id="onboarding-cac" label="CAC" value={state.cac} placeholder="1,200" onChange={(cac) => update({ cac })} />
            <MetricField id="onboarding-ltv" label="LTV" value={state.ltv} placeholder="12,000" onChange={(ltv) => update({ ltv })} />
            <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]"><MetricField id="onboarding-headcount" label="Headcount" value={state.headcount} placeholder="12" prefix="" onChange={(headcount) => update({ headcount })} /></div>
          </div>
        </fieldset>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving || isUploading} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={onFinish} disabled={saving || isUploading}>Skip for now</Button>
          <Button type="button" onClick={onFinish} disabled={saving || isUploading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Finish setup {!saving && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
