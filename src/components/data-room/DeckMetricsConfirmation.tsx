import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Loader2, Plus, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCompanyMetrics, type CompanyMetricsData, type SaveState } from "@/hooks/useCompanyMetrics";
import {
  readMetricAttributions,
  type MetricAttribution,
  type MetricAttributions,
} from "./deckMetricsExtraction";
import {
  computeLtvCacRatio,
  computeStickiness,
  convertRunway,
  formatRatio,
  parseSmartNumber,
  smartBlurCurrency,
  smartBlurInteger,
  smartBlurMultiplier,
  smartBlurPercent,
} from "./metricsFormatting";

const VERIFIED_STORAGE_KEY = "deck-metrics-verified";

type ReviewField =
  | "tam"
  | "sam"
  | "som"
  | "nrr"
  | "churnRate"
  | "mau"
  | "dau"
  | "burnMultiple"
  | "cac"
  | "ltv"
  | "cacPaybackDays"
  | "monthlyBurnRate"
  | "grossMargin"
  | "cashOnHand"
  | "totalDebt"
  | "runway"
  | "headcount"
  | "background";

const REVIEW_FIELDS: ReviewField[] = [
  "tam",
  "sam",
  "som",
  "nrr",
  "churnRate",
  "mau",
  "dau",
  "burnMultiple",
  "cac",
  "ltv",
  "cacPaybackDays",
  "monthlyBurnRate",
  "grossMargin",
  "cashOnHand",
  "totalDebt",
  "runway",
  "headcount",
  "background",
];

type Magnitude = "" | "k" | "m" | "b";

function readVerifiedFields(): Set<ReviewField> {
  try {
    const raw = sessionStorage.getItem(VERIFIED_STORAGE_KEY);

    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return new Set();
    const fields: ReviewField[] = [];

    for (const item of parsed) {
      for (const field of REVIEW_FIELDS) {
        if (item === field) {
          fields.push(field);
          break;
        }
      }
    }

    return new Set(fields);
  } catch {
    return new Set();
  }
}

function writeVerifiedFields(fields: Set<ReviewField>): void {
  try {
    sessionStorage.setItem(VERIFIED_STORAGE_KEY, JSON.stringify([...fields]));
  } catch {
    /* ignore quota / private mode */
  }
}

function attributionFor(field: ReviewField, attributions: MetricAttributions): MetricAttribution | undefined {
  if (field === "mau") return attributions.activeUsers;

  return attributions[field];
}

function fieldValue(metrics: CompanyMetricsData, field: ReviewField): string {
  if (field === "mau") {
    return metrics.activeUsersMode === "dau" && metrics.dau.trim()
      ? ""
      : metrics.activeUsers;
  }

  if (field === "dau") {
    return metrics.dau.trim()
      ? metrics.dau
      : metrics.activeUsersMode === "dau"
        ? metrics.activeUsers
        : "";
  }

  return metrics[field];
}

function inferMagnitude(stored: string): Magnitude {
  const n = parseSmartNumber(stored);

  if (n >= 1_000_000_000) return "b";

  if (n >= 1_000_000) return "m";

  if (n >= 1_000) return "k";

  return "";
}

function compactFromStored(stored: string, magnitude: Magnitude): string {
  const n = parseSmartNumber(stored);

  if (!n) return "";
  const divisor = magnitude === "b" ? 1e9 : magnitude === "m" ? 1e6 : magnitude === "k" ? 1e3 : 1;
  const shown = n / divisor;
  const rounded = shown >= 100 ? Math.round(shown) : Math.round(shown * 10) / 10;

  return String(rounded);
}

function storedFromCompact(display: string, magnitude: Magnitude): string {
  return smartBlurCurrency(`${display}${magnitude}`);
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
        Saved
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
        <AlertCircle className="h-3 w-3" />
        Saved locally
      </span>
    );
  }

  return null;
}

function AttributionBadge({ attribution }: { attribution?: MetricAttribution }) {
  if (!attribution) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {attribution.slideNumber !== undefined && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-950/60 border border-emerald-800 text-emerald-300">
          <Sparkles className="w-3 h-3" />
          Slide {attribution.slideNumber}
        </span>
      )}
      {attribution.confidence === "low" && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-950/60 border border-amber-800 text-amber-300">
          ⚠️ Needs review
        </span>
      )}
    </div>
  );
}

function MagnitudeSelect({
  value,
  onChange,
}: {
  value: Magnitude;
  onChange: (next: Magnitude) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-neutral-800">
      {(["k", "m", "b"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(value === option ? "" : option)}
          className={cn(
            "px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide",
            value === option
              ? "bg-emerald-950/70 text-emerald-300"
              : "bg-neutral-950 text-neutral-500 hover:text-neutral-300",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function MetricInput({
  id,
  value,
  onChange,
  onVerified,
  prefix,
  suffix,
  placeholder,
  magnitude,
  onMagnitudeChange,
  formatOnBlur,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onVerified: () => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  magnitude?: Magnitude;
  onMagnitudeChange?: (next: Magnitude) => void;
  formatOnBlur: (raw: string) => string;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setLocal(value);
  }, [value]);

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 focus-within:border-emerald-800">
      {prefix && <span className="shrink-0 text-sm text-neutral-500">{prefix}</span>}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        onBlur={() => {
          const formatted = formatOnBlur(local);
          setLocal(formatted);
          onChange(formatted);

          if (formatted.trim()) onVerified();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent font-mono text-sm tabular-nums text-neutral-100 outline-none placeholder:text-neutral-600"
      />
      {onMagnitudeChange && magnitude !== undefined && (
        <MagnitudeSelect value={magnitude} onChange={onMagnitudeChange} />
      )}
      {suffix && <span className="shrink-0 text-xs text-neutral-500">{suffix}</span>}
    </div>
  );
}

function MetricCard({
  field,
  label,
  value,
  attribution,
  verified,
  prefix,
  suffix,
  placeholder,
  required,
  currency,
  formatOnBlur,
  onChange,
  onVerified,
}: {
  field: ReviewField;
  label: string;
  value: string;
  attribution?: MetricAttribution;
  verified: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  required: boolean;
  currency?: boolean;
  formatOnBlur: (raw: string) => string;
  onChange: (next: string) => void;
  onVerified: () => void;
}) {
  const extracted = Boolean(attribution);
  const [drafting, setDrafting] = useState(value.trim().length > 0 || extracted);
  const [magnitude, setMagnitude] = useState<Magnitude>(() => inferMagnitude(value));

  useEffect(() => {
    if (value.trim()) setDrafting(true);
  }, [value]);

  const displayValue = currency ? compactFromStored(value, magnitude) || value : value;
  const empty = !value.trim() && !extracted;

  return (
    <article className="flex min-h-[148px] flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label htmlFor={`metric-${field}`} className="text-sm font-medium text-neutral-100">
            {label}
          </label>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              required
                ? "border border-emerald-800 bg-emerald-950/50 text-emerald-300"
                : "border border-neutral-800 bg-neutral-950 text-neutral-500",
            )}
          >
            {required ? "Required" : "Optional"}
          </span>
        </div>
        {verified && value.trim() && (
          <span className="shrink-0 text-[10px] font-medium text-emerald-400">Verified</span>
        )}
      </div>

      <AttributionBadge attribution={attribution} />

      {empty && !drafting ? (
        <button
          type="button"
          onClick={() => setDrafting(true)}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Add value
        </button>
      ) : (
        <MetricInput
          id={`metric-${field}`}
          value={displayValue}
          onChange={(next) => onChange(currency ? storedFromCompact(next, magnitude) : next)}
          onVerified={onVerified}
          prefix={prefix}
          suffix={suffix}
          placeholder={placeholder}
          magnitude={currency ? magnitude : undefined}
          onMagnitudeChange={
            currency
              ? (next) => {
                  const current = parseSmartNumber(value);
                  setMagnitude(next);

                  if (current) onChange(smartBlurCurrency(String(current)));
                }
              : undefined
          }
          formatOnBlur={
            currency
              ? (raw) => compactFromStored(storedFromCompact(raw, magnitude), magnitude)
              : formatOnBlur
          }
        />
      )}

      {attribution?.quote && (
        <p className="text-xs text-neutral-400 italic truncate">
          “{attribution.quote}”
        </p>
      )}
    </article>
  );
}

function ComputedCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="flex min-h-[148px] flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <span className="inline-flex items-center rounded border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
          Auto-computed
        </span>
      </div>
      <p className="font-mono text-2xl tabular-nums text-neutral-100">{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </article>
  );
}

function SectionGrid({
  title,
  columns,
  children,
}: {
  title: string;
  columns: 2 | 3;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export interface DeckMetricsConfirmationProps {
  onReupload?: () => void;
  onSkip?: () => void;
  onConfirm?: () => void;
}

export function DeckMetricsConfirmation({
  onReupload,
  onSkip,
  onConfirm,
}: DeckMetricsConfirmationProps) {
  const { metrics, update, saveState } = useCompanyMetrics();
  const attributions = useMemo(() => readMetricAttributions(), []);
  const [verified, setVerified] = useState<Set<ReviewField>>(readVerifiedFields);

  const markVerified = (field: ReviewField) => {
    setVerified((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      writeVerifiedFields(next);

      return next;
    });
  };

  const mauValue = metrics.activeUsersMode === "mau" ? metrics.activeUsers : "";
  const dauValue = fieldValue(metrics, "dau");
  const ltvCacRatio = computeLtvCacRatio(metrics.ltv, metrics.cac);
  const stickiness = computeStickiness(dauValue, mauValue || metrics.activeUsers);

  const totalCount = REVIEW_FIELDS.length;
  const verifiedCount = REVIEW_FIELDS.filter((field) => verified.has(field)).length;
  const progress = Math.round((verifiedCount / totalCount) * 100);

  const persistMau = (next: string) => {
    update({ activeUsers: next, activeUsersMode: "mau" });
  };

  const persistDau = (next: string) => {
    if (metrics.activeUsersMode === "dau" || !metrics.activeUsers.trim()) {
      update({ dau: next, activeUsers: next, activeUsersMode: "dau" });

      return;
    }

    update({ dau: next });
  };

  const handleConfirm = () => {
    const filled = new Set(verified);

    for (const field of REVIEW_FIELDS) {
      if (fieldValue(metrics, field).trim()) filled.add(field);
    }

    setVerified(filled);
    writeVerifiedFields(filled);
    toast({
      title: "Metrics saved to your data room",
      description: `${filled.size} of ${totalCount} fields are ready for investors.`,
    });
    onConfirm?.();
  };

  return (
    <div className="relative w-full bg-neutral-950 pb-24">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-50">
            Review Extracted Metrics
          </h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            We auto-extracted these key metrics from your deck. Review and adjust any values before publishing to your data room.
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-56">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-neutral-400">
            <span className="font-mono tabular-nums">
              {verifiedCount} of {totalCount} verified
            </span>
            <SaveIndicator state={saveState} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        <SectionGrid title="Market" columns={3}>
          <MetricCard
            field="tam"
            label="TAM"
            value={metrics.tam}
            attribution={attributionFor("tam", attributions)}
            verified={verified.has("tam")}
            required
            currency
            prefix="$"
            placeholder="14.2"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ tam: next })}
            onVerified={() => markVerified("tam")}
          />
          <MetricCard
            field="sam"
            label="SAM"
            value={metrics.sam}
            attribution={attributionFor("sam", attributions)}
            verified={verified.has("sam")}
            required={false}
            currency
            prefix="$"
            placeholder="3.1"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ sam: next })}
            onVerified={() => markVerified("sam")}
          />
          <MetricCard
            field="som"
            label="SOM"
            value={metrics.som}
            attribution={attributionFor("som", attributions)}
            verified={verified.has("som")}
            required={false}
            currency
            prefix="$"
            placeholder="0.42"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ som: next })}
            onVerified={() => markVerified("som")}
          />
        </SectionGrid>

        <SectionGrid title="Traction" columns={3}>
          <MetricCard
            field="nrr"
            label="NRR"
            value={metrics.nrr}
            attribution={attributionFor("nrr", attributions)}
            verified={verified.has("nrr")}
            required={false}
            suffix="%"
            placeholder="118"
            formatOnBlur={smartBlurPercent}
            onChange={(next) => update({ nrr: next })}
            onVerified={() => markVerified("nrr")}
          />
          <MetricCard
            field="churnRate"
            label="Churn Rate"
            value={metrics.churnRate}
            attribution={attributionFor("churnRate", attributions)}
            verified={verified.has("churnRate")}
            required={false}
            suffix="%"
            placeholder="2.5"
            formatOnBlur={smartBlurPercent}
            onChange={(next) => update({ churnRate: next })}
            onVerified={() => markVerified("churnRate")}
          />
          <MetricCard
            field="mau"
            label="MAU"
            value={mauValue}
            attribution={attributionFor("mau", attributions)}
            verified={verified.has("mau")}
            required={false}
            placeholder="12,000"
            formatOnBlur={smartBlurInteger}
            onChange={persistMau}
            onVerified={() => markVerified("mau")}
          />
          <MetricCard
            field="dau"
            label="DAU"
            value={dauValue}
            attribution={attributionFor("dau", attributions)}
            verified={verified.has("dau")}
            required={false}
            placeholder="3,200"
            formatOnBlur={smartBlurInteger}
            onChange={persistDau}
            onVerified={() => markVerified("dau")}
          />
          <MetricCard
            field="burnMultiple"
            label="Burn Multiple"
            value={metrics.burnMultiple}
            attribution={attributionFor("burnMultiple", attributions)}
            verified={verified.has("burnMultiple")}
            required={false}
            suffix="x"
            placeholder="1.5"
            formatOnBlur={smartBlurMultiplier}
            onChange={(next) => update({ burnMultiple: next })}
            onVerified={() => markVerified("burnMultiple")}
          />
          {stickiness !== null && (
            <ComputedCard
              label="Stickiness (DAU/MAU)"
              value={`${(Math.round(stickiness * 10) / 10).toFixed(1)}%`}
              hint="Daily actives as a share of monthly actives."
            />
          )}
        </SectionGrid>

        <SectionGrid title="Unit Economics" columns={3}>
          <MetricCard
            field="cac"
            label="CAC"
            value={metrics.cac}
            attribution={attributionFor("cac", attributions)}
            verified={verified.has("cac")}
            required
            currency
            prefix="$"
            placeholder="250"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ cac: next })}
            onVerified={() => markVerified("cac")}
          />
          <MetricCard
            field="ltv"
            label="LTV"
            value={metrics.ltv}
            attribution={attributionFor("ltv", attributions)}
            verified={verified.has("ltv")}
            required
            currency
            prefix="$"
            placeholder="5,000"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ ltv: next })}
            onVerified={() => markVerified("ltv")}
          />
          <ComputedCard
            label="LTV : CAC Ratio"
            value={formatRatio(ltvCacRatio)}
            hint="LTV / CAC. Updates as either number changes."
          />
          <MetricCard
            field="cacPaybackDays"
            label="CAC Payback"
            value={metrics.cacPaybackDays}
            attribution={attributionFor("cacPaybackDays", attributions)}
            verified={verified.has("cacPaybackDays")}
            required={false}
            suffix="days"
            placeholder="180"
            formatOnBlur={smartBlurInteger}
            onChange={(next) => update({ cacPaybackDays: next })}
            onVerified={() => markVerified("cacPaybackDays")}
          />
          <MetricCard
            field="monthlyBurnRate"
            label="Monthly Burn"
            value={metrics.monthlyBurnRate}
            attribution={attributionFor("monthlyBurnRate", attributions)}
            verified={verified.has("monthlyBurnRate")}
            required
            currency
            prefix="$"
            placeholder="85"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ monthlyBurnRate: next })}
            onVerified={() => markVerified("monthlyBurnRate")}
          />
          <MetricCard
            field="grossMargin"
            label="Gross Margin"
            value={metrics.grossMargin}
            attribution={attributionFor("grossMargin", attributions)}
            verified={verified.has("grossMargin")}
            required={false}
            suffix="%"
            placeholder="72"
            formatOnBlur={smartBlurPercent}
            onChange={(next) => update({ grossMargin: next })}
            onVerified={() => markVerified("grossMargin")}
          />
          <MetricCard
            field="cashOnHand"
            label="Cash on Hand"
            value={metrics.cashOnHand}
            attribution={attributionFor("cashOnHand", attributions)}
            verified={verified.has("cashOnHand")}
            required={false}
            currency
            prefix="$"
            placeholder="1.4"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ cashOnHand: next })}
            onVerified={() => markVerified("cashOnHand")}
          />
          <MetricCard
            field="totalDebt"
            label="Total Debt"
            value={metrics.totalDebt}
            attribution={attributionFor("totalDebt", attributions)}
            verified={verified.has("totalDebt")}
            required={false}
            currency
            prefix="$"
            placeholder="0"
            formatOnBlur={smartBlurCurrency}
            onChange={(next) => update({ totalDebt: next })}
            onVerified={() => markVerified("totalDebt")}
          />
          <article className="flex min-h-[148px] flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="metric-runway" className="text-sm font-medium text-neutral-100">
                  Runway
                </label>
                <span className="rounded border border-emerald-800 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  Required
                </span>
              </div>
              {verified.has("runway") && metrics.runway.trim() && (
                <span className="text-[10px] font-medium text-emerald-400">Verified</span>
              )}
            </div>
            <AttributionBadge attribution={attributionFor("runway", attributions)} />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const converted = convertRunway(metrics.runway, metrics.runwayUnit, "months");
                  update({ runwayUnit: "months", runway: converted });
                }}
                className={cn(
                  "rounded-md border px-2 py-1 text-[10px] font-medium uppercase",
                  metrics.runwayUnit === "months"
                    ? "border-emerald-800 bg-emerald-950/70 text-emerald-300"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-300",
                )}
              >
                Months
              </button>
              <button
                type="button"
                onClick={() => {
                  const converted = convertRunway(metrics.runway, metrics.runwayUnit, "days");
                  update({ runwayUnit: "days", runway: converted });
                }}
                className={cn(
                  "rounded-md border px-2 py-1 text-[10px] font-medium uppercase",
                  metrics.runwayUnit === "days"
                    ? "border-emerald-800 bg-emerald-950/70 text-emerald-300"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-300",
                )}
              >
                Days
              </button>
            </div>
            <MetricInput
              id="metric-runway"
              value={metrics.runway}
              onChange={(next) => update({ runway: next })}
              onVerified={() => markVerified("runway")}
              suffix={metrics.runwayUnit}
              placeholder="18"
              formatOnBlur={smartBlurInteger}
            />
            {attributionFor("runway", attributions)?.quote && (
              <p className="text-xs text-neutral-400 italic truncate">
                “{attributionFor("runway", attributions)?.quote}”
              </p>
            )}
          </article>
        </SectionGrid>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-neutral-200">Team</h3>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <MetricCard
              field="headcount"
              label="Headcount"
              value={metrics.headcount}
              attribution={attributionFor("headcount", attributions)}
              verified={verified.has("headcount")}
              required
              placeholder="12"
              formatOnBlur={smartBlurInteger}
              onChange={(next) => update({ headcount: next })}
              onVerified={() => markVerified("headcount")}
            />
            <article className="flex min-h-[148px] flex-col gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5 xl:col-span-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <label htmlFor="metric-background" className="text-sm font-medium text-neutral-100">
                    Founding Team Background
                  </label>
                  <span className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                    Optional
                  </span>
                </div>
                {verified.has("background") && metrics.background.trim() && (
                  <span className="text-[10px] font-medium text-emerald-400">Verified</span>
                )}
              </div>
              <AttributionBadge attribution={attributionFor("background", attributions)} />
              <textarea
                id="metric-background"
                value={metrics.background}
                onChange={(event) => update({ background: event.target.value })}
                onBlur={() => {
                  if (metrics.background.trim()) markVerified("background");
                }}
                rows={6}
                placeholder="Founder bios, key hires, notable advisors. Markdown is fine."
                className="min-h-[140px] w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-800"
              />
              {attributionFor("background", attributions)?.quote && (
                <p className="text-xs text-neutral-400 italic truncate">
                  “{attributionFor("background", attributions)?.quote}”
                </p>
              )}
            </article>
          </div>
        </section>
      </div>

      <footer className="sticky bottom-0 z-20 mt-10 flex flex-col gap-3 border-t border-neutral-800 bg-neutral-950/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onReupload}
          className="text-neutral-400 hover:text-neutral-200 text-sm"
        >
          <Upload className="w-4 h-4 mr-1.5 inline" />
          Re-upload Deck
        </button>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="text-neutral-400 hover:text-neutral-200 text-sm mr-4"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm"
          >
            Confirm & Save to Data Room →
          </button>
        </div>
      </footer>
    </div>
  );
}

export default DeckMetricsConfirmation;
