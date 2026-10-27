import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyTeamMembersField } from "./CompanyTeamMembersField";
import {
  type AdaptiveMetricsData,
  type CompanyMetricsData,
  EMPTY_METRICS,
  type MetricsBusinessModel,
  type RevenueMagnitude,
  type SaveState,
} from "@/hooks/useCompanyMetrics";
import {
  formatWithCommas,
  parseSmartNumber,
  smartBlurCurrency,
  smartBlurInteger,
  smartBlurPercent,
} from "./metricsFormatting";
import type { MetricAttribution, MetricAttributions } from "./deckMetricsExtraction";

type UpdateMetrics = (
  patch: Partial<CompanyMetricsData>,
  options?: { immediate?: boolean },
) => void;

interface FounderMetricsSetupProps {
  metrics: CompanyMetricsData;
  update: UpdateMetrics;
  saveState: SaveState;
  retry: () => void;
  attributions?: MetricAttributions;
  initialValues?: Partial<CompanyMetricsData>;
  onLegacyValueChange?: (field: keyof CompanyMetricsData, value: string) => void;
  onRequiredValidityChange?: (isReady: boolean) => void;
  showHeader?: boolean;
  topContent?: ReactNode;
}

const MODELS: { value: MetricsBusinessModel; label: string }[] = [
  { value: "saas", label: "⚡ SaaS & Subscriptions" },
  { value: "usage", label: "🧠 Usage-Based & AI Infra" },
  { value: "marketplace", label: "🔄 Marketplace & Fintech" },
  { value: "pre_revenue", label: "🚀 Pre-Revenue & Stealth" },
];

const MAGNITUDES: RevenueMagnitude[] = ["k", "m", "b"];
const MAGNITUDE_VALUE: Record<RevenueMagnitude, number> = { k: 1e3, m: 1e6, b: 1e9 };
const MAGNITUDE_LABEL: Record<RevenueMagnitude, string> = { k: "K", m: "M", b: "B" };

function AutosaveStatus({ state, retry }: { state: SaveState; retry: () => void }) {
  if (state === "saving") {
    return <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving...</span>;
  }
  if (state === "error") {
    return <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300"><AlertCircle className="h-3.5 w-3.5" />Save failed · Retry</button>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400"><Check className="h-3.5 w-3.5 text-emerald-400" />All changes saved</span>;
}

function Section({ title, children, description, className }: { title: string; children: ReactNode; description?: string; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 pb-2">
        <h3 className="font-sans text-sm font-semibold text-neutral-100">{title}</h3>
        {description && <p className="font-sans text-xs text-neutral-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function unitValue(value: string, magnitude: RevenueMagnitude): string {
  if (!value.trim()) return "";
  const shown = parseSmartNumber(value) / MAGNITUDE_VALUE[magnitude];
  return Number.isFinite(shown) ? String(Math.round(shown * 10) / 10) : "";
}

function attributionFor(field: string, attributions?: MetricAttributions): MetricAttribution | undefined {
  const keyed = attributions as unknown as Record<string, MetricAttribution | undefined> | undefined;
  if (field === "mau") return attributions?.activeUsers;
  if (field === "dau") return keyed?.dau ?? attributions?.activeUsers;
  return keyed?.[field];
}

function Field({
  metrics, update, field, label, value, format = "text", prefix, suffix, placeholder, helper,
  required = false, magnitudeKey, magnitudeOptions, attribution, notTrackedKey,
  onLegacyValueChange, inputType = "text", projectedText,
}: {
  metrics: CompanyMetricsData;
  update: UpdateMetrics;
  field: keyof CompanyMetricsData;
  label: string;
  value: string;
  format?: "text" | "currency" | "percent" | "integer";
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  helper?: string;
  required?: boolean;
  magnitudeKey?: keyof Pick<AdaptiveMetricsData, "revenueMagnitude" | "cashMagnitude" | "burnMagnitude" | "debtMagnitude" | "marketMagnitude">;
  magnitudeOptions?: RevenueMagnitude[];
  attribution?: MetricAttribution;
  notTrackedKey?: "cacNotTracked" | "ltvNotTracked" | "nrrNotTracked" | "churnNotTracked";
  onLegacyValueChange?: FounderMetricsSetupProps["onLegacyValueChange"];
  inputType?: "text" | "month";
  projectedText?: string;
}) {
  const magnitude = magnitudeKey ? metrics[magnitudeKey] as RevenueMagnitude : undefined;
  const [draft, setDraft] = useState(() => magnitude ? unitValue(value, magnitude) : value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(magnitude ? unitValue(value, magnitude) : value);
  }, [value, magnitude]);

  const notTracked = notTrackedKey ? Boolean(metrics[notTrackedKey]) : false;
  const projectionText = `${projectedText ?? ""} ${attribution?.quote ?? ""}`;
  const isProjected = /\b(projected|target|forecast)\b/i.test(projectionText);

  const writeValue = (next: string) => {
    if (field === "activeUsers") update({ activeUsers: next, activeUsersMode: "mau" });
    else update({ [field]: next } as Partial<CompanyMetricsData>);
    onLegacyValueChange?.(field, next);
  };

  const updateValue = (raw: string) => {
    let next = raw;
    if (magnitude) {
      const parsed = parseSmartNumber(raw);
      next = raw.trim() ? String(Math.round(parsed * MAGNITUDE_VALUE[magnitude])) : "";
    } else if (format === "integer") {
      next = raw.replace(/[^0-9]/g, "");
    } else if (format === "percent") {
      next = raw.replace(/[^0-9.+-]/g, "");
    }
    writeValue(next);
  };

  const formatOnBlur = (raw: string) => {
    if (magnitude) return smartBlurCurrency(String(parseSmartNumber(raw) * MAGNITUDE_VALUE[magnitude]));
    if (format === "currency") return smartBlurCurrency(raw);
    if (format === "percent") return smartBlurPercent(raw);
    if (format === "integer") return smartBlurInteger(raw);
    return raw.trim();
  };

  return (
    <article className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <div className="mb-2 flex min-h-5 flex-wrap items-center justify-between gap-2">
        <label htmlFor={`founder-metric-${String(field)}`} className="font-sans text-xs font-medium text-neutral-200">
          {label}{required && <span className="ml-1 text-emerald-400">Required</span>}
        </label>
        {attribution?.slideNumber !== undefined && (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-800/80 bg-emerald-950/50 px-2 py-0.5 font-sans text-xs text-emerald-400">
            <Sparkles className="h-3 w-3" />Slide {attribution.slideNumber}
          </span>
        )}
      </div>
      {notTrackedKey && (
        <label className="mb-2 flex items-center gap-2 font-sans text-[11px] text-neutral-500">
          <input
            type="checkbox"
            checked={notTracked}
            onChange={(event) => update({ [notTrackedKey]: event.target.checked } as Partial<CompanyMetricsData>, { immediate: true })}
            className="accent-emerald-500"
          />
          Pre-traction / Not tracked yet
        </label>
      )}
      {notTracked ? (
        <div className="flex h-10 items-center rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 font-mono text-sm text-neutral-600">N/A</div>
      ) : (
        <div className="flex min-h-10 items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 focus-within:border-emerald-700">
          {prefix && <span className="font-mono text-sm text-neutral-500">{prefix}</span>}
          <input
            ref={inputRef}
            id={`founder-metric-${String(field)}`}
            type={inputType}
            inputMode={inputType === "text" ? format === "text" ? "text" : "decimal" : undefined}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); updateValue(event.target.value); }}
            onBlur={() => { const formatted = formatOnBlur(draft); setDraft(magnitude ? unitValue(formatted, magnitude) : formatted); writeValue(formatted); }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums text-neutral-100 outline-none placeholder:text-neutral-700"
          />
          {suffix && <span className="shrink-0 font-mono text-xs text-neutral-500">{suffix}</span>}
          {magnitudeKey && magnitude && (
            <div className="ml-1 flex shrink-0 overflow-hidden rounded-md border border-neutral-800">
              {(magnitudeOptions ?? (["k", "m"] as RevenueMagnitude[])).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => update({ [magnitudeKey]: option } as Partial<CompanyMetricsData>, { immediate: true })}
                  className={cn("px-1.5 py-1 font-sans text-[10px] font-medium", magnitude === option ? "bg-emerald-950 text-emerald-300" : "text-neutral-500 hover:text-neutral-300")}
                >{MAGNITUDE_LABEL[option]}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {helper && <p className="mt-2 font-sans text-[11px] leading-relaxed text-neutral-500">{helper}</p>}
      {isProjected && <p className="mt-2 inline-flex rounded border border-amber-800/80 bg-amber-950/50 px-2 py-1 font-sans text-xs text-amber-400">⚠️ Inferred as Projected — verify actual ARR</p>}
      {attribution?.quote && <p className="mt-2 truncate font-sans text-xs italic text-neutral-400">“{attribution.quote}”</p>}
    </article>
  );
}

function ComputedField({
  label, value, helper, overridden, onToggle, onValueChange, onLegacyValueChange, field, unit = "currency", attribution,
}: {
  label: string;
  value: string;
  helper: string;
  overridden: boolean;
  onToggle: () => void;
  onValueChange?: (value: string) => void;
  onLegacyValueChange?: FounderMetricsSetupProps["onLegacyValueChange"];
  field?: keyof CompanyMetricsData;
  unit?: "currency" | "months" | "ratio";
  attribution?: MetricAttribution;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const display = unit === "currency"
    ? value.trim() ? `$ ${formatWithCommas(parseSmartNumber(value))}` : "—"
    : unit === "ratio" ? value.trim() ? `${(Math.round(parseSmartNumber(value) * 10) / 10).toFixed(1)}x` : "—"
      : value.trim() ? `${value} months` : "—";
  const isProjected = /\b(projected|target|forecast)\b/i.test(attribution?.quote ?? "");
  return (
    <article className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-sans text-xs font-medium text-neutral-200">{label}</span>
        <div className="flex items-center gap-2">
          {attribution?.slideNumber !== undefined && <span className="inline-flex items-center gap-1 rounded border border-emerald-800/80 bg-emerald-950/50 px-2 py-0.5 font-sans text-[10px] text-emerald-400"><Sparkles className="h-3 w-3" />Slide {attribution.slideNumber}</span>}
          <span className={cn("rounded border px-2 py-0.5 font-sans text-[10px] font-medium", overridden ? "border-amber-800 bg-amber-950/50 text-amber-300" : "border-emerald-800/80 bg-emerald-950/50 text-emerald-400")}>{overridden ? "Manual override" : "⚡ Auto-computed"}</span>
          <button type="button" onClick={onToggle} className="font-sans text-[10px] text-neutral-400 underline underline-offset-2 hover:text-neutral-200">{overridden ? "Use calculated" : "Override"}</button>
        </div>
      </div>
      {overridden ? (
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 focus-within:border-emerald-700">
          {unit === "currency" && <span className="font-mono text-sm text-neutral-500">$</span>}
          <input
            value={draft}
            onChange={(event) => { setDraft(event.target.value); onValueChange?.(event.target.value); if (field) onLegacyValueChange?.(field, event.target.value); }}
            onBlur={() => { const formatted = unit === "currency" ? smartBlurCurrency(draft) : unit === "ratio" ? String(Math.round(parseSmartNumber(draft) * 10) / 10) : smartBlurInteger(draft); setDraft(formatted); onValueChange?.(formatted); if (field) onLegacyValueChange?.(field, formatted); }}
            inputMode="decimal"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums text-neutral-100 outline-none"
            placeholder={unit === "months" ? "18" : unit === "ratio" ? "1.5" : "50,000"}
          />
          {unit === "months" && <span className="font-mono text-xs text-neutral-500">months</span>}
          {unit === "ratio" && <span className="font-mono text-xs text-neutral-500">x</span>}
        </div>
      ) : <p className="min-h-10 font-mono text-xl tabular-nums text-neutral-100">{display}</p>}
      <p className="mt-2 font-sans text-[11px] leading-relaxed text-neutral-500">{helper}</p>
      {isProjected && <p className="mt-2 inline-flex rounded border border-amber-800/80 bg-amber-950/50 px-2 py-1 font-sans text-xs text-amber-400">⚠️ Inferred as Projected — verify actual ARR</p>}
      {attribution?.quote && <p className="mt-2 truncate font-sans text-xs italic text-neutral-400">“{attribution.quote}”</p>}
    </article>
  );
}

function GrowthToggle({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string] }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5">
      {options.map((option) => (
        <button key={option} type="button" onClick={() => onChange(option)} className={cn("rounded-md px-2 py-1 font-sans text-[10px] font-medium", value === option ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300")}>{option.toUpperCase()}</button>
      ))}
    </div>
  );
}

export function FounderMetricsSetup({ metrics, update, saveState, retry, attributions, initialValues, onLegacyValueChange, onRequiredValidityChange, showHeader = true, topContent }: FounderMetricsSetupProps) {
  const hydratedInitialValues = useRef(false);
  useEffect(() => {
    if (hydratedInitialValues.current || !initialValues) return;
    hydratedInitialValues.current = true;
    const patch: Partial<CompanyMetricsData> = {};
    for (const [key, value] of Object.entries(initialValues)) {
      const currentValue = (metrics as unknown as Record<string, unknown>)[key];
      const emptyValue = (EMPTY_METRICS as unknown as Record<string, unknown>)[key];
      if (value !== undefined && Object.is(currentValue, emptyValue)) {
        (patch as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(patch).length) update(patch);
  }, [initialValues, metrics, update]);

  const requiredReady = Boolean(metrics.tam.trim() && metrics.headcount.trim() && metrics.cashOnHand.trim() && metrics.monthlyBurnRate.trim());
  useEffect(() => onRequiredValidityChange?.(requiredReady), [onRequiredValidityChange, requiredReady]);
  const runwayValue = metrics.runway;
  const mrrValue = metrics.mrr;
  const ratio = metrics.ltv.trim() && metrics.cac.trim() && parseSmartNumber(metrics.cac) !== 0
    ? String(parseSmartNumber(metrics.ltv) / parseSmartNumber(metrics.cac))
    : "";
  const stickiness = parseSmartNumber(metrics.activeUsers) > 0 && parseSmartNumber(metrics.dau) >= 0 && metrics.dau.trim()
    ? `${(parseSmartNumber(metrics.dau) / parseSmartNumber(metrics.activeUsers) * 100).toFixed(1)}%`
    : "—";
  const at = (field: string) => attributionFor(field, attributions);
  const legacy = onLegacyValueChange;

  return (
    <div className="space-y-7 font-sans">
      {showHeader && <header className="flex flex-col gap-3 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-50">Key Metrics &amp; Data Room Setup</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">Review and adjust your key performance indicators. Data syncs directly with investor records and your data room.</p>
        </div>
        <div className="shrink-0"><AutosaveStatus state={saveState} retry={retry} /></div>
      </header>}

      <div className="space-y-2">
        <p className="font-sans text-xs font-medium text-neutral-400">Business model</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Business model">
          {MODELS.map((model) => (
            <button key={model.value} type="button" aria-pressed={metrics.businessModel === model.value} onClick={() => update({ businessModel: model.value }, { immediate: true })} className={cn("rounded-full border px-3 py-2 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600", metrics.businessModel === model.value ? "border-emerald-700 bg-emerald-950/60 text-emerald-200" : "border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:text-neutral-100")}>{model.label}</button>
          ))}
        </div>
      </div>

      {topContent}

      {metrics.businessModel === "pre_revenue" && <div className="rounded-lg border border-amber-900/70 bg-amber-950/30 px-4 py-3 font-sans text-sm text-amber-200">Pre-revenue mode active. Historical ARR/MRR metrics are disabled; highlight commercial traction below.</div>}

      <Section title="Revenue & Growth" description="Fields adapt to your business model; values stay saved when you switch models.">
        {metrics.businessModel === "saas" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="arr" label="ARR" value={metrics.arr} format="currency" prefix="$" required magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} attribution={at("arr")} onLegacyValueChange={legacy} />
          <ComputedField label="MRR" value={mrrValue} helper="Auto-synced from ARR ÷ 12. Override to enter a different monthly value." overridden={metrics.mrrIsOverridden} onToggle={() => update({ mrrIsOverridden: !metrics.mrrIsOverridden }, { immediate: true })} onValueChange={(mrr) => update({ mrr })} field="mrr" attribution={at("mrr")} onLegacyValueChange={legacy} />
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-sans text-xs font-medium text-neutral-200">Growth Rate</span><GrowthToggle value={metrics.growthRateMode} onChange={(mode) => update({ growthRateMode: mode as "yoy" | "mom" }, { immediate: true })} options={["yoy", "mom"]} /></div><Field metrics={metrics} update={update} field={metrics.growthRateMode === "yoy" ? "yoyGrowth" : "momGrowth"} label={metrics.growthRateMode === "yoy" ? "Year over year" : "Month over month"} value={metrics.growthRateMode === "yoy" ? metrics.yoyGrowth : metrics.momGrowth} format="percent" suffix="%" placeholder="12" attribution={at(metrics.growthRateMode === "yoy" ? "yoyGrowth" : "momGrowth")} onLegacyValueChange={legacy} /></div>
          <Field metrics={metrics} update={update} field="committedArr" label="Committed ARR (cARR)" value={metrics.committedArr} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} helper="Signed contracts and pilots not yet live." attribution={at("committedArr")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="recurringRevenuePercent" label="Recurring vs. Services" value={metrics.recurringRevenuePercent} format="percent" suffix="% recurring" helper="Software subscriptions vs custom setup and services." attribution={at("recurringRevenuePercent")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="customerConcentration" label="Customer Concentration" value={metrics.customerConcentration} format="percent" suffix="% top customer" helper="Revenue share from your largest client." attribution={at("customerConcentration")} onLegacyValueChange={legacy} />
        </div>}
        {metrics.businessModel === "usage" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="arr" label="Annualized Run-Rate (ARR)" value={metrics.arr} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} attribution={at("arr")} onLegacyValueChange={legacy} />
          <ComputedField label="Monthly Billed Consumption (MRR)" value={mrrValue} helper="Auto-synced from ARR ÷ 12. Override when monthly consumption differs." overridden={metrics.mrrIsOverridden} onToggle={() => update({ mrrIsOverridden: !metrics.mrrIsOverridden }, { immediate: true })} onValueChange={(mrr) => update({ mrr })} field="mrr" attribution={at("mrr")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="momGrowth" label="MoM Revenue Growth Rate" value={metrics.momGrowth} format="percent" suffix="%" placeholder="12" attribution={at("momGrowth")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="paidComputeVolume" label="Paid Compute / Token Volume" value={metrics.paidComputeVolume} format="integer" suffix="tokens / mo" placeholder="Active paid workspaces" attribution={at("paidComputeVolume")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="grossMargin" label="Gross Margin" value={metrics.grossMargin} format="percent" suffix="%" helper="Hosting and model inference costs deducted." attribution={at("grossMargin")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="nrr" label="Net Expansion (NRR / NDR)" value={metrics.nrr} format="percent" suffix="%" notTrackedKey="nrrNotTracked" attribution={at("nrr")} onLegacyValueChange={legacy} />
        </div>}
        {metrics.businessModel === "marketplace" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="gmv" label="GMV" value={metrics.gmv} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={MAGNITUDES} helper="Gross merchandise value." attribution={at("gmv")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="takeRate" label="Take Rate" value={metrics.takeRate} format="percent" suffix="%" placeholder="12.5" attribution={at("takeRate")} onLegacyValueChange={legacy} />
          <ComputedField label="Net Revenue" value={metrics.netRevenue} helper="GMV × take rate. Override if reported net revenue differs." overridden={metrics.netRevenueIsOverridden} onToggle={() => update({ netRevenueIsOverridden: !metrics.netRevenueIsOverridden }, { immediate: true })} onValueChange={(netRevenue) => update({ netRevenue })} attribution={at("netRevenue")} />
          <Field metrics={metrics} update={update} field="gmvGrowth" label="MoM GMV Growth" value={metrics.gmvGrowth} format="percent" suffix="%" attribution={at("gmvGrowth")} onLegacyValueChange={legacy} />
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-sans text-xs font-medium text-neutral-200">Active Transacting Accounts</span><GrowthToggle value={metrics.transactingAccountType} onChange={(mode) => update({ transactingAccountType: mode as "buyers" | "sellers" }, { immediate: true })} options={["buyers", "sellers"]} /></div><Field metrics={metrics} update={update} field={metrics.transactingAccountType === "buyers" ? "activeBuyers" : "activeSellers"} label={metrics.transactingAccountType === "buyers" ? "Buyers" : "Sellers"} value={metrics.transactingAccountType === "buyers" ? metrics.activeBuyers : metrics.activeSellers} format="integer" placeholder="250" attribution={at("transactingAccounts")} onLegacyValueChange={legacy} /></div>
          <Field metrics={metrics} update={update} field="averageOrderValue" label="Average Order Value (AOV)" value={metrics.averageOrderValue} format="currency" prefix="$" attribution={at("averageOrderValue")} onLegacyValueChange={legacy} />
        </div>}
        {metrics.businessModel === "pre_revenue" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="signedPipeline" label="Signed LOI / Contract Pipeline" value={metrics.signedPipeline} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} attribution={at("signedPipeline")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="designPartners" label="Active Design Partners / Pilots" value={metrics.designPartners} format="integer" placeholder="3" attribution={at("designPartners")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="targetContractValue" label="Target Contract Value (ACV)" value={metrics.targetContractValue} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} attribution={at("targetContractValue")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="targetLaunchDate" label="Target Launch Date" value={metrics.targetLaunchDate} inputType="month" attribution={at("targetLaunchDate")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="projectedYear1Revenue" label="Projected Year 1 Revenue" value={metrics.projectedYear1Revenue} format="currency" prefix="$" magnitudeKey="revenueMagnitude" magnitudeOptions={["k", "m"]} projectedText="Projected Year 1 revenue" attribution={at("projectedYear1Revenue")} onLegacyValueChange={legacy} />
        </div>}
      </Section>

      <Section title="Traction & Retention" description="Engagement, customer retention, and active accounts.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="nrr" label="Net Revenue Retention (NRR)" value={metrics.nrr} format="percent" suffix="%" notTrackedKey="nrrNotTracked" helper="Common SaaS benchmark: above 110%." attribution={at("nrr")} onLegacyValueChange={legacy} />
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-sans text-xs font-medium text-neutral-200">Churn Rate</span><GrowthToggle value={metrics.churnPeriod} onChange={(period) => update({ churnPeriod: period as "monthly" | "annual" }, { immediate: true })} options={["monthly", "annual"]} /></div><Field metrics={metrics} update={update} field={metrics.churnPeriod === "monthly" ? "churnRate" : "annualChurnRate"} label={`${metrics.churnPeriod === "monthly" ? "Monthly" : "Annual"} churn`} value={metrics.churnPeriod === "monthly" ? metrics.churnRate : metrics.annualChurnRate} format="percent" suffix="%" notTrackedKey="churnNotTracked" attribution={at("churnRate")} onLegacyValueChange={legacy} /></div>
          <Field metrics={metrics} update={update} field="activeUsers" label="Monthly Active Users (MAU)" value={metrics.activeUsersMode === "mau" ? metrics.activeUsers : ""} format="integer" placeholder="12,000" attribution={at("mau")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="dau" label="Daily Active Users (DAU)" value={metrics.dau || (metrics.activeUsersMode === "dau" ? metrics.activeUsers : "")} format="integer" placeholder="3,000" attribution={at("dau")} onLegacyValueChange={legacy} />
          <article className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4"><p className="mb-2 font-sans text-xs font-medium text-neutral-200">Stickiness (DAU / MAU)</p><p className="font-mono text-xl tabular-nums text-neutral-100">{stickiness}</p><p className="mt-2 font-sans text-[11px] text-neutral-500">Daily active users as a share of monthly active users.</p></article>
          <Field metrics={metrics} update={update} field="activeLogos" label="Active Logos / Paying Customers" value={metrics.activeLogos} format="integer" placeholder="48" attribution={at("activeLogos")} onLegacyValueChange={legacy} />
        </div>
      </Section>

      <Section title="Unit Economics" description="Customer-level acquisition and lifetime value.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="cac" label="Customer Acquisition Cost (CAC)" value={metrics.cac} format="currency" prefix="$" notTrackedKey="cacNotTracked" placeholder="250" attribution={at("cac")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="ltv" label="Lifetime Value (LTV)" value={metrics.ltv} format="currency" prefix="$" notTrackedKey="ltvNotTracked" placeholder="5,000" attribution={at("ltv")} onLegacyValueChange={legacy} />
          <ComputedField label="LTV : CAC Ratio" value={metrics.ltvCacRatioOverride || ratio} helper="LTV ÷ CAC. Zero CAC is not calculated." overridden={metrics.ltvCacRatioIsOverridden} onToggle={() => update({ ltvCacRatioIsOverridden: !metrics.ltvCacRatioIsOverridden, ltvCacRatioOverride: metrics.ltvCacRatioIsOverridden ? "" : metrics.ltvCacRatioOverride }, { immediate: true })} onValueChange={(ltvCacRatioOverride) => update({ ltvCacRatioOverride })} unit="ratio" attribution={at("ltvCacRatioOverride")} />
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-sans text-xs font-medium text-neutral-200">CAC Payback Period</span><GrowthToggle value={metrics.cacPaybackUnit} onChange={(unit) => update({ cacPaybackUnit: unit as "days" | "months" }, { immediate: true })} options={["months", "days"]} /></div><Field metrics={metrics} update={update} field="cacPaybackDays" label="Payback period" value={metrics.cacPaybackDays} format="integer" suffix={metrics.cacPaybackUnit} attribution={at("cacPaybackDays")} onLegacyValueChange={legacy} /></div>
          <Field metrics={metrics} update={update} field="grossMargin" label="Gross Margin" value={metrics.grossMargin} format="percent" suffix="%" attribution={at("grossMargin")} onLegacyValueChange={legacy} />
        </div>
      </Section>

      <Section title="Capital & Financial Health" description="Balance sheet and runway.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="cashOnHand" label="Cash on Hand" value={metrics.cashOnHand} format="currency" prefix="$" required magnitudeKey="cashMagnitude" magnitudeOptions={["k", "m"]} attribution={at("cashOnHand")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="monthlyBurnRate" label="Monthly Net Burn" value={metrics.monthlyBurnRate} format="currency" prefix="$" required magnitudeKey="burnMagnitude" magnitudeOptions={["k", "m"]} attribution={at("monthlyBurnRate")} onLegacyValueChange={legacy} />
          <ComputedField label="Runway" value={runwayValue} helper="Cash on hand ÷ monthly net burn." overridden={metrics.runwayIsOverride} onToggle={() => update(metrics.runwayIsOverride ? { runwayIsOverride: false, runway: "" } : { runwayIsOverride: true }, { immediate: true })} onValueChange={(runway) => update({ runway })} unit="months" attribution={at("runway")} />
          <Field metrics={metrics} update={update} field="totalDebt" label="Total Debt" value={metrics.totalDebt} format="currency" prefix="$" magnitudeKey="debtMagnitude" magnitudeOptions={["k", "m"]} attribution={at("totalDebt")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="burnMultiple" label="Burn Multiple" value={metrics.burnMultiple} format="text" suffix="x" placeholder="1.5" helper="Net burn ÷ net new ARR. Enter the ratio when available." attribution={at("burnMultiple")} onLegacyValueChange={legacy} />
        </div>
      </Section>

      <Section title="Market Opportunity" description="Market sizing in the currency scale you report.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field metrics={metrics} update={update} field="tam" label="TAM (Total Addressable Market)" value={metrics.tam} format="currency" prefix="$" required magnitudeKey="marketMagnitude" magnitudeOptions={["m", "b"]} attribution={at("tam")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="sam" label="SAM (Serviceable Addressable Market)" value={metrics.sam} format="currency" prefix="$" magnitudeKey="marketMagnitude" magnitudeOptions={["m", "b"]} attribution={at("sam")} onLegacyValueChange={legacy} />
          <Field metrics={metrics} update={update} field="som" label="SOM (Serviceable Obtainable Market)" value={metrics.som} format="currency" prefix="$" magnitudeKey="marketMagnitude" magnitudeOptions={["m", "b"]} attribution={at("som")} onLegacyValueChange={legacy} />
        </div>
      </Section>

      <Section title="Team & Background" description="Team size, open roles, and the experience behind the company.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Field metrics={metrics} update={update} field="headcount" label="Total Headcount" value={metrics.headcount} format="integer" required placeholder="12" attribution={at("headcount")} onLegacyValueChange={legacy} />
            <Field metrics={metrics} update={update} field="keyOpenHires" label="Key Open Hires" value={metrics.keyOpenHires} format="text" placeholder="Founding GTM Lead" attribution={at("keyOpenHires")} onLegacyValueChange={legacy} />
          </div>
          <article className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 lg:col-span-2">
            <label htmlFor="founder-metric-background" className="mb-2 block font-sans text-xs font-medium text-neutral-200">Founding Team Background</label>
            <textarea id="founder-metric-background" value={metrics.background} onChange={(event) => { update({ background: event.target.value }); onLegacyValueChange?.("background", event.target.value); }} rows={6} placeholder="Brief founder backgrounds, previous exits, or technical domain expertise..." className="min-h-36 w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 font-sans text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-emerald-700" />
            {at("background")?.slideNumber !== undefined && <p className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-800/80 bg-emerald-950/50 px-2 py-0.5 font-sans text-xs text-emerald-400"><Sparkles className="h-3 w-3" />Slide {at("background")?.slideNumber}</p>}
            {at("background")?.quote && <p className="mt-2 truncate font-sans text-xs italic text-neutral-400">“{at("background")?.quote}”</p>}
          </article>
        </div>
        <CompanyTeamMembersField />
      </Section>
    </div>
  );
}

export default FounderMetricsSetup;
