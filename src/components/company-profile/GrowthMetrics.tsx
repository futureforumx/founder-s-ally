import { useState, useRef } from "react";
import { TrendingUp, DollarSign, Users, Check, ChevronUp, ChevronDown, ShieldCheck } from "lucide-react";

// ── Utilities ──

function parseSmartNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.toString().toLowerCase().replace(/[^0-9.kmb]/g, "");
  const match = cleaned.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") num *= 1_000;
  if (suffix === "m") num *= 1_000_000;
  if (suffix === "b") num *= 1_000_000_000;
  return num;
}

function formatWithCommas(num: number): string {
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
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

interface FieldError {
  arr: string;
  yoy: string;
  headcount: string;
}

const LIMITS = { arr: 200_000_000, yoy: 500_000, headcount: 100_000 } as const;

// ── Smart Inputs ──

function SmartCurrencyInput({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error: string }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className="relative">
        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={(e) => setLocal(e.target.value.replace(/[^0-9.,mkbMKB]/g, ""))}
          onFocus={() => setLocal(value)}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            const capped = Math.min(raw, LIMITS.arr);
            const formatted = formatWithCommas(capped || parseSmartNumber(local));
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 1.2m or 1,200,000"
          className={`w-full rounded-lg border bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SmartPercentageInput({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error: string }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className="relative">
        <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={(e) => setLocal(e.target.value.replace(/[^0-9.kmKM]/g, ""))}
          onFocus={() => setLocal(value)}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            const capped = Math.min(raw, LIMITS.yoy);
            const formatted = formatWithCommas(capped || parseSmartNumber(local));
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 150"
          className={`w-full rounded-lg border bg-background pl-9 pr-14 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        <span className="absolute right-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SmartIntegerInput({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error: string }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className="relative">
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={(e) => setLocal(e.target.value.replace(/[^0-9kmKM]/g, ""))}
          onFocus={() => setLocal(value)}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            const capped = Math.min(raw, LIMITS.headcount);
            const formatted = formatWithCommas(capped || parseSmartNumber(local));
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 25"
          className={`w-full rounded-lg border bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ── Main ──

export function GrowthMetrics({
  currentARR, yoyGrowth, totalHeadcount,
  onChange, onConfirm, isVerified = false,
  sourceLabel = "Verified from Pitch Deck",
  defaultExpanded = true,
}: GrowthMetricsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [errors, setErrors] = useState<FieldError>({ arr: "", yoy: "", headcount: "" });

  const handleARR = (v: string) => {
    const raw = parseSmartNumber(v);
    if (raw > LIMITS.arr) {
      setErrors((p) => ({ ...p, arr: `Limit exceeded. Max is $${LIMITS.arr.toLocaleString()}.` }));
    } else {
      setErrors((p) => ({ ...p, arr: "" }));
    }
    onChange("currentARR", v);
  };

  const handleYoY = (v: string) => {
    const raw = parseSmartNumber(v);
    if (raw > LIMITS.yoy) {
      setErrors((p) => ({ ...p, yoy: `Limit exceeded. Max is ${LIMITS.yoy.toLocaleString()}%.` }));
    } else {
      setErrors((p) => ({ ...p, yoy: "" }));
    }
    onChange("yoyGrowth", v);
  };

  const handleHeadcount = (v: string) => {
    const raw = parseSmartNumber(v);
    if (raw > LIMITS.headcount) {
      setErrors((p) => ({ ...p, headcount: `Limit exceeded. Max is ${LIMITS.headcount.toLocaleString()}.` }));
    } else {
      setErrors((p) => ({ ...p, headcount: "" }));
    }
    onChange("totalHeadcount", v);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-surface">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Current ARR</label>
              <SmartCurrencyInput value={currentARR} onChange={handleARR} error={errors.arr} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">YoY Growth</label>
              <SmartPercentageInput value={yoyGrowth} onChange={handleYoY} error={errors.yoy} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Total Headcount</label>
              <SmartIntegerInput value={totalHeadcount} onChange={handleHeadcount} error={errors.headcount} />
            </div>
          </div>

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
