import { useState, useCallback, useRef } from "react";
import { TrendingUp, DollarSign, Users, Check, ChevronUp, ChevronDown, ShieldCheck } from "lucide-react";

// ── Smart formatting helpers ──

/** Clean input, parse shorthand (k/m/b), return formatted string with commas */
function formatSmartCurrency(inputValue: string): string {
  if (!inputValue) return "";
  const cleaned = inputValue.toString().toLowerCase().replace(/[\s,$]/g, "");
  const match = cleaned.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return cleaned.replace(/[^\d]/g, "");
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") num *= 1_000;
  if (suffix === "m") num *= 1_000_000;
  if (suffix === "b") num *= 1_000_000_000;
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Parse a formatted/shorthand string back to a number */
function parseSmartCurrency(raw: string): number | null {
  const formatted = formatSmartCurrency(raw);
  if (!formatted) return null;
  const n = parseFloat(formatted.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

/** Strip non-numeric chars except decimal point */
function stripNonNumeric(s: string): string {
  return s.replace(/[^0-9.]/g, "");
}

// ── Types ──

interface GrowthMetricsProps {
  currentARR: string;
  yoyGrowth: string;
  totalHeadcount: string;
  onChange: (field: "currentARR" | "yoyGrowth" | "totalHeadcount", value: string) => void;
  onConfirm?: () => void;
  isVerified?: boolean;
  sourceLabel?: string;
  defaultExpanded?: boolean;
}

// ── Smart Input sub-components ──

function SmartCurrencyInput({
  value,
  onChange,
  isValid,
}: {
  value: string;
  onChange: (v: string) => void;
  isValid: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  const displayValue = localValue !== value && document.activeElement !== inputRef.current ? value : localValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, commas, dots, m, k, b
    const filtered = raw.replace(/[^0-9.,mkbMKB]/g, "");
    setLocalValue(filtered);
  };

  const handleBlur = () => {
    const formatted = formatSmartCurrency(localValue);
    if (formatted) {
      setLocalValue(formatted);
      onChange(formatted);
    } else if (localValue.trim() === "") {
      onChange("");
      setLocalValue("");
    }
  };

  return (
    <div className="relative">
      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => setLocalValue(value)}
        placeholder="e.g. 1.2m or 1,200,000"
        className="w-full rounded-lg border border-input bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:ring-2 focus:ring-ring focus:outline-none"
      />
      {isValid && value && (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
      )}
    </div>
  );
}

function SmartPercentageInput({
  value,
  onChange,
  isValid,
}: {
  value: string;
  onChange: (v: string) => void;
  isValid: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    onChange(raw);
  };

  const handleBlur = () => {
    if (!value) return;
    const num = parseFloat(value);
    if (isNaN(num)) { onChange(""); return; }
    const clamped = Math.min(num, 10000);
    onChange(String(clamped));
  };

  return (
    <div className="relative">
      <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="e.g. 150"
        className="w-full rounded-lg border border-input bg-background pl-9 pr-14 py-2.5 text-sm text-foreground transition-all focus:ring-2 focus:ring-ring focus:outline-none"
      />
      <span className="absolute right-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
      {isValid && value && (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
      )}
    </div>
  );
}

function SmartIntegerInput({
  value,
  onChange,
  isValid,
}: {
  value: string;
  onChange: (v: string) => void;
  isValid: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = stripNonNumeric(e.target.value).replace(".", "");
    onChange(stripped);
  };

  const handleBlur = () => {
    if (!value) return;
    const num = parseInt(value, 10);
    if (isNaN(num)) { onChange(""); return; }
    const clamped = Math.min(num, 10000);
    onChange(String(clamped));
  };

  return (
    <div className="relative">
      <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="e.g. 25"
        className="w-full rounded-lg border border-input bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:ring-2 focus:ring-ring focus:outline-none"
      />
      {isValid && value && (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
      )}
    </div>
  );
}

// ── Main component ──

export function GrowthMetrics({
  currentARR,
  yoyGrowth,
  totalHeadcount,
  onChange,
  onConfirm,
  isVerified = false,
  sourceLabel = "Verified from Pitch Deck",
  defaultExpanded = true,
}: GrowthMetricsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const arrValid = !!currentARR && parseSmartCurrency(currentARR.replace(/,/g, "")) !== null;
  const growthValid = !!yoyGrowth && !isNaN(parseFloat(yoyGrowth)) && parseFloat(yoyGrowth) <= 10000;
  const headcountValid = !!totalHeadcount && !isNaN(parseInt(totalHeadcount, 10)) && parseInt(totalHeadcount, 10) <= 10000;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-accent" />
          Growth Metrics
        </span>
        <div className="flex items-center gap-2">
          {isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <Check className="h-3 w-3" />
              {sourceLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Input Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current ARR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Current ARR
              </label>
              <SmartCurrencyInput
                value={currentARR}
                onChange={(v) => onChange("currentARR", v)}
                isValid={arrValid}
              />
            </div>

            {/* YoY Growth */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                YoY Growth
              </label>
              <SmartPercentageInput
                value={yoyGrowth}
                onChange={(v) => onChange("yoyGrowth", v)}
                isValid={growthValid}
              />
            </div>

            {/* Total Headcount */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Total Headcount
              </label>
              <SmartIntegerInput
                value={totalHeadcount}
                onChange={(v) => onChange("totalHeadcount", v)}
                isValid={headcountValid}
              />
            </div>
          </div>

          {/* Bottom Action */}
          {onConfirm && (
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20"
              >
                <ShieldCheck className="h-4 w-4" />
                Confirm Profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
