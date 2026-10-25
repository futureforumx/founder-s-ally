import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyMetrics, type SaveState } from "@/hooks/useCompanyMetrics";
import {
  smartBlurCurrency,
  smartBlurPercent,
  smartBlurInteger,
  smartBlurMultiplier,
  convertActiveUsers,
  convertRunway,
  computeLtvCacRatio,
  formatRatio,
} from "./metricsFormatting";

const FIELD = "color-mix(in srgb, hsl(var(--foreground)) 7%, hsl(var(--card)))";
const ACCENT_TINT = "hsl(var(--primary) / 0.14)";
const ACCENT_RING = "0 0 0 1px hsl(var(--primary))";
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

function chipStyle(active: boolean): CSSProperties {
  return {
    background: active ? ACCENT_TINT : FIELD,
    boxShadow: active ? ACCENT_RING : "none",
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0">
      <p className="text-[12.5px] font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

/** Compact inspector field. Label sits in the chip; the value formats on blur. */
function SmartField({
  label,
  value,
  onChange,
  onBlurFormat,
  placeholder,
  prefix,
  suffix,
  allowedChars = /[^0-9.,kmbKMB+\-*/()$]/g,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlurFormat: (raw: string) => string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  allowedChars?: RegExp;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = local.trim().length > 0;

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setLocal(value);
  }, [value]);

  return (
    <label
      className="flex h-[26px] min-w-0 items-center gap-1 rounded-lg py-1 pr-1.5 pl-2 transition-[background-color,box-shadow] duration-200 focus-within:shadow-[0_0_0_1px_hsl(var(--primary))]"
      style={chipStyle(filled)}
    >
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      {prefix && <span className="shrink-0 text-[12px] text-muted-foreground">{prefix}</span>}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={local}
        aria-label={label}
        onChange={(e) => setLocal(e.target.value.replace(allowedChars, ""))}
        onBlur={() => {
          const formatted = onBlurFormat(local);
          setLocal(formatted);
          onChange(formatted);
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground tabular-nums outline-none placeholder:text-muted-foreground/70"
      />
      {suffix && <span className="shrink-0 text-[11.5px] text-muted-foreground">{suffix}</span>}
    </label>
  );
}

function SmartTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const filled = value.trim().length > 0;
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      aria-label="Background"
      className="w-full resize-none rounded-lg px-2.5 py-2 text-[12px] text-foreground outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 focus:shadow-[0_0_0_1px_hsl(var(--primary))]"
      style={chipStyle(filled)}
    />
  );
}

function UnitToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, options.findIndex((opt) => opt.id === value));
  return (
    <div
      className="relative grid rounded-[10px] p-0.5"
      style={{ background: FIELD, gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 top-0.5 rounded-[6px] bg-card shadow-sm transition-transform duration-300 motion-reduce:transition-none"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: EASE,
          boxShadow: "0 1px 2px rgba(0,0,0,0.28), 0 0 0 1px hsl(var(--border) / 0.8)",
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={opt.id === value}
          onClick={() => onChange(opt.id)}
          className={cn(
            "relative z-10 flex h-6 items-center justify-center rounded-[6px] text-[12px] font-medium transition-colors duration-200",
            opt.id === value ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
  placeholder = "e.g. 1.2m",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <SmartField
      label={label}
      value={value}
      onChange={onChange}
      onBlurFormat={smartBlurCurrency}
      prefix="$"
      placeholder={placeholder}
    />
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-success animate-in fade-in zoom-in-95 duration-200">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-destructive">
        <AlertCircle className="h-3 w-3" /> Couldn't sync — saved locally
      </span>
    );
  }
  return null;
}

export function MetricsPanel() {
  const { metrics, update, saveState } = useCompanyMetrics();
  const ltvCacRatio = computeLtvCacRatio(metrics.ltv, metrics.cac);
  const activeUsersLabel = metrics.activeUsersMode === "dau" ? "DAU" : "MAU";

  return (
    <div className="w-full max-w-[520px] animate-in fade-in duration-200">
      <div className="overflow-hidden rounded-[20px] bg-card shadow-[0_0_0_1px_hsl(var(--border)),0_18px_40px_-28px_rgba(0,0,0,0.75)]">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-foreground">
            Key metrics for your data room. Everything here saves automatically as you type.
          </p>
          {saveState !== "idle" && (
            <div className="flex justify-end">
              <SaveIndicator state={saveState} />
            </div>
          )}
        </div>

        <Section title="Team">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SmartField
              label="Headcount"
              value={metrics.headcount}
              onChange={(v) => update({ headcount: v })}
              onBlurFormat={smartBlurInteger}
              placeholder="e.g. 12"
              allowedChars={/[^0-9kmKM+\-*/()]/g}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-muted-foreground">Background</p>
            <SmartTextarea
              value={metrics.background}
              onChange={(v) => update({ background: v })}
              placeholder="Founding team backgrounds, key hires, notable advisors…"
            />
          </div>
        </Section>

        <Section title="Market">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <CurrencyField label="TAM" value={metrics.tam} onChange={(v) => update({ tam: v })} />
            <CurrencyField label="SAM" value={metrics.sam} onChange={(v) => update({ sam: v })} />
            <CurrencyField label="SOM" value={metrics.som} onChange={(v) => update({ som: v })} />
          </div>
        </Section>

        <Section title="Traction">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SmartField
              label="NRR"
              value={metrics.nrr}
              onChange={(v) => update({ nrr: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 110"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
            <SmartField
              label="Churn Rate"
              value={metrics.churnRate}
              onChange={(v) => update({ churnRate: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 2.5"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
          <UnitToggle
            options={[
              { id: "mau" as const, label: "MAU" },
              { id: "dau" as const, label: "DAU" },
            ]}
            value={metrics.activeUsersMode}
            onChange={(mode) => {
              const converted = convertActiveUsers(metrics.activeUsers, metrics.activeUsersMode, mode);
              update({ activeUsersMode: mode, activeUsers: converted });
            }}
          />
          <SmartField
            label={activeUsersLabel}
            value={metrics.activeUsers}
            onChange={(v) => update({ activeUsers: v })}
            onBlurFormat={smartBlurInteger}
            placeholder="e.g. 12,000"
            allowedChars={/[^0-9kmKM+\-*/()]/g}
          />
          <SmartField
            label="Burn Multiple"
            value={metrics.burnMultiple}
            onChange={(v) => update({ burnMultiple: v })}
            onBlurFormat={smartBlurMultiplier}
            suffix="x"
            placeholder="e.g. 1.5"
            allowedChars={/[^0-9.+\-*/()]/g}
          />
        </Section>

        <Section title="Unit Economics">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CurrencyField label="CAC" value={metrics.cac} onChange={(v) => update({ cac: v })} placeholder="e.g. 250" />
            <CurrencyField label="LTV" value={metrics.ltv} onChange={(v) => update({ ltv: v })} placeholder="e.g. 5,000" />
            <div
              className="flex h-[26px] min-w-0 items-center justify-between gap-2 rounded-lg py-1 pr-1.5 pl-2 sm:col-span-2"
              style={chipStyle(ltvCacRatio !== null)}
            >
              <span className="shrink-0 text-[12px] text-muted-foreground">LTV : CAC Ratio</span>
              <span className="text-[12px] font-medium tabular-nums text-primary">{formatRatio(ltvCacRatio)}</span>
            </div>
            <SmartField
              label="CAC Payback"
              value={metrics.cacPaybackDays}
              onChange={(v) => update({ cacPaybackDays: v })}
              onBlurFormat={smartBlurInteger}
              suffix="days"
              placeholder="e.g. 180"
              allowedChars={/[^0-9+\-*/()]/g}
            />
          </div>
        </Section>

        <Section title="Financial Health">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CurrencyField
              label="Monthly Burn Rate"
              value={metrics.monthlyBurnRate}
              onChange={(v) => update({ monthlyBurnRate: v })}
              placeholder="e.g. 85k"
            />
            <SmartField
              label="Gross Margin"
              value={metrics.grossMargin}
              onChange={(v) => update({ grossMargin: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 72"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
            <CurrencyField label="Cash on Hand" value={metrics.cashOnHand} onChange={(v) => update({ cashOnHand: v })} placeholder="e.g. 1.4m" />
            <CurrencyField label="Total Debt" value={metrics.totalDebt} onChange={(v) => update({ totalDebt: v })} placeholder="e.g. 0" />
          </div>
          <UnitToggle
            options={[
              { id: "months" as const, label: "Months" },
              { id: "days" as const, label: "Days" },
            ]}
            value={metrics.runwayUnit}
            onChange={(unit) => {
              const converted = convertRunway(metrics.runway, metrics.runwayUnit, unit);
              update({ runwayUnit: unit, runway: converted });
            }}
          />
          <SmartField
            label="Runway"
            value={metrics.runway}
            onChange={(v) => update({ runway: v })}
            onBlurFormat={smartBlurInteger}
            suffix={metrics.runwayUnit}
            placeholder="e.g. 18"
            allowedChars={/[^0-9.+\-*/()]/g}
          />
        </Section>
      </div>
    </div>
  );
}

export default MetricsPanel;
