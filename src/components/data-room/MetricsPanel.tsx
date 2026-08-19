import { useEffect, useRef, useState, type ComponentType } from "react";
import { Users, Target, TrendingUp, Scale, Wallet, DollarSign, Loader2, Check, AlertCircle } from "lucide-react";
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

// ── Layout primitives ──

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 p-6 pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-accent" /> {title}
        </h3>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      {children}
    </label>
  );
}

/** Generic smart text input: formats on blur, syncs with external value changes (e.g. unit toggles) while not focused. */
function SmartField({
  value,
  onChange,
  onBlurFormat,
  placeholder,
  prefixIcon: PrefixIcon,
  suffix,
  allowedChars = /[^0-9.,kmbKMB+\-*/()$]/g,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurFormat: (raw: string) => string;
  placeholder?: string;
  prefixIcon?: ComponentType<{ className?: string }>;
  suffix?: string;
  allowedChars?: RegExp;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setLocal(value);
  }, [value]);

  const suffixPad = suffix ? (suffix.length > 2 ? "pr-16" : "pr-9") : "pr-3";

  return (
    <div className="relative">
      {PrefixIcon && (
        <PrefixIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(allowedChars, ""))}
        onBlur={() => {
          const formatted = onBlurFormat(local);
          setLocal(formatted);
          onChange(formatted);
        }}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-input bg-background py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring",
          PrefixIcon ? "pl-9" : "pl-3",
          suffixPad,
        )}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
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
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-ring"
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
  return (
    <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all",
            value === opt.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Dollar-amount field (TAM/SAM/SOM, CAC, LTV, burn rate, cash, debt) — shared $ prefix + currency blur formatting. */
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
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <SmartField value={value} onChange={onChange} onBlurFormat={smartBlurCurrency} prefixIcon={DollarSign} placeholder={placeholder} />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
        <AlertCircle className="h-3 w-3" /> Couldn't sync — saved locally
      </span>
    );
  }
  return null;
}

// ── Main panel ──

export function MetricsPanel() {
  const { metrics, update, saveState } = useCompanyMetrics();
  const ltvCacRatio = computeLtvCacRatio(metrics.ltv, metrics.cac);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Key metrics for your data room. Everything here saves automatically as you type.
        </p>
        <SaveIndicator state={saveState} />
      </div>

      {/* TEAM */}
      <SectionCard icon={Users} title="Team">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <FieldLabel>Headcount</FieldLabel>
            <SmartField
              value={metrics.headcount}
              onChange={(v) => update({ headcount: v })}
              onBlurFormat={smartBlurInteger}
              placeholder="e.g. 12"
              prefixIcon={Users}
              allowedChars={/[^0-9kmKM+\-*/()]/g}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <FieldLabel>Background</FieldLabel>
            <SmartTextarea
              value={metrics.background}
              onChange={(v) => update({ background: v })}
              placeholder="Founding team backgrounds, key hires, notable advisors…"
            />
          </div>
        </div>
      </SectionCard>

      {/* MARKET */}
      <SectionCard icon={Target} title="Market">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CurrencyField label="TAM" value={metrics.tam} onChange={(v) => update({ tam: v })} />
          <CurrencyField label="SAM" value={metrics.sam} onChange={(v) => update({ sam: v })} />
          <CurrencyField label="SOM" value={metrics.som} onChange={(v) => update({ som: v })} />
        </div>
      </SectionCard>

      {/* TRACTION */}
      <SectionCard icon={TrendingUp} title="Traction">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>NRR</FieldLabel>
            <SmartField
              value={metrics.nrr}
              onChange={(v) => update({ nrr: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 110"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <FieldLabel>{metrics.activeUsersMode === "dau" ? "DAU" : "MAU"}</FieldLabel>
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
            </div>
            <SmartField
              value={metrics.activeUsers}
              onChange={(v) => update({ activeUsers: v })}
              onBlurFormat={smartBlurInteger}
              prefixIcon={Users}
              placeholder="e.g. 12,000"
              allowedChars={/[^0-9kmKM+\-*/()]/g}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Churn Rate</FieldLabel>
            <SmartField
              value={metrics.churnRate}
              onChange={(v) => update({ churnRate: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 2.5"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Burn Multiple</FieldLabel>
            <SmartField
              value={metrics.burnMultiple}
              onChange={(v) => update({ burnMultiple: v })}
              onBlurFormat={smartBlurMultiplier}
              suffix="x"
              placeholder="e.g. 1.5"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
        </div>
      </SectionCard>

      {/* UNIT ECONOMICS */}
      <SectionCard icon={Scale} title="Unit Economics">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <CurrencyField label="CAC" value={metrics.cac} onChange={(v) => update({ cac: v })} placeholder="e.g. 250" />
          <CurrencyField label="LTV" value={metrics.ltv} onChange={(v) => update({ ltv: v })} placeholder="e.g. 5,000" />
          <div className="space-y-1.5">
            <FieldLabel>LTV : CAC Ratio</FieldLabel>
            <div className="flex h-[42px] items-center rounded-lg border border-accent/20 bg-accent/5 px-3 text-sm font-semibold text-accent">
              {formatRatio(ltvCacRatio)}
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>CAC Payback</FieldLabel>
            <SmartField
              value={metrics.cacPaybackDays}
              onChange={(v) => update({ cacPaybackDays: v })}
              onBlurFormat={smartBlurInteger}
              suffix="days"
              placeholder="e.g. 180"
              allowedChars={/[^0-9+\-*/()]/g}
            />
          </div>
        </div>
      </SectionCard>

      {/* FINANCIAL HEALTH */}
      <SectionCard icon={Wallet} title="Financial Health">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CurrencyField
            label="Monthly Burn Rate"
            value={metrics.monthlyBurnRate}
            onChange={(v) => update({ monthlyBurnRate: v })}
            placeholder="e.g. 85k"
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <FieldLabel>Runway</FieldLabel>
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
            </div>
            <SmartField
              value={metrics.runway}
              onChange={(v) => update({ runway: v })}
              onBlurFormat={smartBlurInteger}
              suffix={metrics.runwayUnit}
              placeholder="e.g. 18"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Gross Margin</FieldLabel>
            <SmartField
              value={metrics.grossMargin}
              onChange={(v) => update({ grossMargin: v })}
              onBlurFormat={smartBlurPercent}
              suffix="%"
              placeholder="e.g. 72"
              allowedChars={/[^0-9.+\-*/()]/g}
            />
          </div>
          <CurrencyField label="Cash on Hand" value={metrics.cashOnHand} onChange={(v) => update({ cashOnHand: v })} placeholder="e.g. 1.4m" />
          <CurrencyField label="Total Debt" value={metrics.totalDebt} onChange={(v) => update({ totalDebt: v })} placeholder="e.g. 0" />
        </div>
      </SectionCard>
    </div>
  );
}

export default MetricsPanel;
