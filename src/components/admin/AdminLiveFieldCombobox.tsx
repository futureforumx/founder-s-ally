import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { calculateMatchScore, fuzzyMatch } from "@/lib/fuzzyMatch";
import {
  formatAdminLiveFieldDisplay,
  parseAdminLiveFieldValue,
  type AdminLiveFieldOption,
  type AdminLiveFieldRecommendation,
  type AdminLiveFieldSpec,
} from "@/lib/adminLiveFieldOptions";

function optionMatches(option: AdminLiveFieldOption, query: string): boolean {
  if (!query.trim()) return true;
  return (
    fuzzyMatch(query, option.label) ||
    fuzzyMatch(query, option.value) ||
    fuzzyMatch(query, option.desc || "")
  );
}

export function AdminLiveFieldCombobox({
  id,
  fieldKey,
  spec,
  value,
  recommendation,
  onChange,
}: {
  id: string;
  fieldKey: string;
  spec: AdminLiveFieldSpec;
  value: unknown;
  recommendation: AdminLiveFieldRecommendation | null;
  onChange: (next: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = formatAdminLiveFieldDisplay(fieldKey, value);
  const currentRaw = value == null || value === "" ? "" : String(value);

  const filtered = useMemo(() => {
    const q = open ? query : "";
    const rows = spec.options.filter((opt) => optionMatches(opt, q));
    if (!q.trim()) return rows;
    return [...rows].sort((a, b) => {
      const scoreA = calculateMatchScore(q, a.label, `${a.value} ${a.desc ?? ""}`);
      const scoreB = calculateMatchScore(q, b.label, `${b.value} ${b.desc ?? ""}`);
      return scoreB - scoreA;
    });
  }, [open, query, spec.options]);

  const parsedQuery = parseAdminLiveFieldValue(fieldKey, query);
  const customValue =
    spec.allowCustom &&
    query.trim() &&
    parsedQuery.ok &&
    parsedQuery.value != null &&
    String(parsedQuery.value) !== "" &&
    !spec.options.some((opt) => opt.value === String(parsedQuery.value)) &&
    !filtered.some((opt) => opt.label.toLowerCase() === query.trim().toLowerCase())
      ? String(parsedQuery.value)
      : null;

  const recommended =
    recommendation &&
    recommendation.value !== currentRaw &&
    (open ? optionMatches({ value: recommendation.value, label: recommendation.value, desc: recommendation.reason }, query) || !query.trim() : true)
      ? recommendation
      : null;

  const items: Array<{ value: string; label: string; desc?: string; suggested?: boolean; custom?: boolean }> = [];
  if (recommended) {
    const match = spec.options.find((opt) => opt.value === recommended.value);
    items.push({
      value: recommended.value,
      label: match?.label ?? formatAdminLiveFieldDisplay(fieldKey, recommended.value) ?? recommended.value,
      desc: recommended.reason,
      suggested: true,
    });
  }
  if (customValue && customValue !== recommended?.value) {
    items.push({
      value: customValue,
      label: spec.kind === "score" ? customValue : query.trim(),
      desc: "Use typed value",
      custom: true,
    });
  }
  for (const opt of filtered) {
    if (items.some((item) => item.value === opt.value)) continue;
    items.push(opt);
  }

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const skipCloseCommit = useRef(false);

  const commit = (raw: string) => {
    const parsed = parseAdminLiveFieldValue(fieldKey, raw);
    if (!parsed.ok) return;
    skipCloseCommit.current = true;
    onChange(parsed.value);
    setOpen(false);
    setQuery("");
  };

  const handleBlurCommit = () => {
    if (skipCloseCommit.current) {
      skipCloseCommit.current = false;
      return;
    }
    const raw = query.trim();
    if (!raw) {
      if (currentRaw) onChange(null);
      return;
    }
    const parsed = parseAdminLiveFieldValue(fieldKey, raw);
    if (parsed.ok) onChange(parsed.value);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) handleBlurCommit();
        else skipCloseCommit.current = false;
        setOpen(next);
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            value={open ? query : display}
            placeholder="Select or type…"
            autoComplete="off"
            onFocus={() => {
              setOpen(true);
              setQuery(spec.kind === "score" ? currentRaw : display || currentRaw);
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              if (!open) setOpen(true);
              const parsed = parseAdminLiveFieldValue(fieldKey, next);
              if (parsed.ok && (spec.kind === "score" || next.trim() === "")) {
                onChange(parsed.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                skipCloseCommit.current = true;
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHighlight((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (open && items[highlight]) {
                  commit(items[highlight].value);
                  return;
                }
                handleBlurCommit();
                setOpen(false);
              }
            }}
            className="pr-8"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show options"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[220] w-[var(--radix-popper-anchor-width)] p-1"
      >
        <div className="max-h-56 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching options</p>
          ) : (
            items.map((item, idx) => {
              const selected = item.value === currentRaw;
              return (
                <button
                  key={`${item.value}-${item.suggested ? "rec" : item.custom ? "custom" : "opt"}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(item.value);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    idx === highlight && "bg-accent/15",
                    selected && "bg-accent/10",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      selected ? "text-primary opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-foreground">{item.label}</span>
                      {item.suggested ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                          <Sparkles className="h-2.5 w-2.5" />
                          Suggested
                        </span>
                      ) : null}
                    </span>
                    {item.desc ? (
                      <span className="block truncate text-[10px] text-muted-foreground">{item.desc}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
