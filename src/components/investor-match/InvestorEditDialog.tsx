import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, DollarSign, ExternalLink, X, User, Building2, Sparkles, Loader2, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { INVESTMENT_TYPES, FUNDING_ROUNDS, PERSON_ROLES, detectEntityType, type CapBacker } from "./CapTableRow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvestorEditDialogProps {
  backer: CapBacker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<CapBacker>) => void;
  onRemove: (id: string) => void;
}

function parseShorthand(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").toLowerCase();
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+\.?\d*)(k|m)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2];
  if (suffix === "k") return num * 1_000;
  if (suffix === "m") return num * 1_000_000;
  return num;
}

function formatWithCommas(n: number): string {
  if (isNaN(n) || n === 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

// Live search result type
interface SearchResult {
  name: string;
  location?: string;
  logoUrl?: string;
  stage?: string;
}

// ── Searchable Combobox with live API search ──
function EntityCombobox({
  value,
  onChange,
  placeholder,
  label,
  searchType = "firm",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  searchType?: "firm" | "person";
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Live search via nfx-search edge function
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data, error } = await supabase.functions.invoke("nfx-search", {
          body: { query: query.trim() },
        });

        if (controller.signal.aborted) return;

        if (!error && data?.results) {
          setResults(data.results.slice(0, 6).map((r: any) => ({
            name: r.name || "Unknown",
            location: r.location || "",
            logoUrl: r.logoUrl || "",
            stage: r.stage || "",
          })));
        } else {
          setResults([]);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedOption = results.find(o => o.name === value) || (value ? { name: value } : null);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 w-full rounded-xl border bg-secondary/30 px-3 py-2.5 text-sm transition-all cursor-text",
          isOpen ? "border-accent/40 ring-2 ring-accent/30" : "border-border hover:border-border/80"
        )}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
          }
        }}
      >
        {value && selectedOption ? (
          <>
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground shrink-0">
              {selectedOption.name.charAt(0)}
            </div>
            <span className="text-sm text-foreground flex-1 truncate">{value}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); }}
              className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </>
        ) : (
          <>
            <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={() => {
                setIsOpen(true);
                if (containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                }
              }}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            {isSearching && <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />}
          </>
        )}
      </div>

      <AnimatePresence>
        {isOpen && !value && createPortal(
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            className="z-[99999] bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto"
          >
            {isSearching && (
              <div className="px-3 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!isSearching && results.length > 0 && results.map(opt => (
              <button
                key={opt.name}
                type="button"
                onClick={() => { onChange(opt.name); setQuery(""); setIsOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                  {opt.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{opt.name}</span>
                  {opt.location && <span className="text-[10px] text-muted-foreground">{opt.location}</span>}
                </div>
              </button>
            ))}
            {!isSearching && query.trim() && !results.some(o => o.name.toLowerCase() === query.toLowerCase()) && (
              <button
                type="button"
                onClick={() => { onChange(query.trim()); setQuery(""); setIsOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-accent hover:bg-accent/5 transition-colors border-t border-border/50 text-left"
              >
                <Plus className="h-3.5 w-3.5" />
                Add "{query.trim()}" as new {label.toLowerCase()}
              </button>
            )}
            {!isSearching && !query.trim() && results.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">Start typing to search…</div>
            )}
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}

export function InvestorEditDialog({ backer, open, onOpenChange, onSave, onRemove }: InvestorEditDialogProps) {
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState("");
  const [round, setRound] = useState("");
  const [closingMonth, setClosingMonth] = useState("");
  const [closingYear, setClosingYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [entityType, setEntityType] = useState<"person" | "firm">("person");
  const [personRole, setPersonRole] = useState("Angel");
  const [leadPartner, setLeadPartner] = useState("");
  const [associatedFirm, setAssociatedFirm] = useState("");

  useEffect(() => {
    if (backer) {
      setAmount(backer.amount > 0 ? formatWithCommas(backer.amount) : "");
      setInstrument(backer.instrument);
      setRound(backer.date);
      const et = backer.entityType;
      if (et === "person" || et === "firm") {
        setEntityType(et);
      } else {
        setEntityType(detectEntityType(backer.name));
      }
      if (backer.entityType === "person" && backer.notes) {
        setPersonRole(PERSON_ROLES.includes(backer.notes) ? backer.notes : "Angel");
        setLeadPartner("");
      } else if (backer.entityType === "firm" && backer.notes) {
        setLeadPartner(backer.notes);
        setPersonRole("Angel");
      } else {
        setPersonRole("Angel");
        setLeadPartner("");
      }
      setAssociatedFirm("");
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      if (backer.date) {
        const parts = backer.date.split(" ");
        if (parts.length === 2 && MONTHS.includes(parts[0])) {
          setClosingMonth(parts[0]);
          setClosingYear(parts[1]);
        } else {
          setClosingMonth("");
          setClosingYear("");
        }
      } else {
        setClosingMonth("");
        setClosingYear("");
      }
      setAmountError(null);
    }
  }, [backer]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(async () => {
    if (!backer) return;

    let parsedAmount = 0;
    if (amount.trim()) {
      const parsed = parseShorthand(amount);
      if (parsed === null) {
        setAmountError("Invalid format. Try 1.5M or 50k");
        return;
      }
      if (parsed < 1_000 || parsed > 50_000_000) {
        setAmountError("Must be $1k – $50M");
        return;
      }
      parsedAmount = parsed;
    }

    setSaving(true);
    try {
      const closingDateStr = closingMonth && closingYear ? `${closingMonth} ${closingYear}` : null;
      const notesValue = entityType === "person"
        ? (associatedFirm ? `${personRole} | ${associatedFirm}` : personRole)
        : (leadPartner || null);

      const updates: Record<string, unknown> = {
        amount: parsedAmount,
        instrument,
        entity_type: entityType,
        notes: notesValue,
      };
      if (closingDateStr) {
        updates.date = closingDateStr;
      }

      const { error } = await supabase
        .from("cap_table")
        .update(updates)
        .eq("id", backer.id);

      if (error) throw error;

      onSave(backer.id, {
        amount: parsedAmount,
        amountLabel: `$${parsedAmount.toLocaleString()}`,
        instrument,
        date: closingDateStr || round,
        entityType,
        notes: notesValue || undefined,
      });

      onOpenChange(false);
      toast.success("Investor updated.");
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }, [backer, amount, instrument, round, closingMonth, closingYear, entityType, personRole, leadPartner, associatedFirm, onSave, onOpenChange]);

  const handleRemove = useCallback(async () => {
    if (!backer) return;
    try {
      const { error } = await supabase.from("cap_table").delete().eq("id", backer.id);
      if (error) throw error;
      onRemove(backer.id);
      onOpenChange(false);
      toast.success("Investor removed.");
    } catch {
      toast.error("Failed to remove investor.");
    }
  }, [backer, onRemove, onOpenChange]);

  if (!backer) return null;

  const websiteHref = backer.website
    ? backer.website.startsWith("http") ? backer.website : `https://${backer.website}`
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0 rounded-lg border border-border shadow-sm">
                    {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} className="object-cover" /> : null}
                    <AvatarFallback
                      className="text-sm font-semibold rounded-lg"
                      style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
                    >
                      {backer.logoLetter}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-bold text-foreground truncate">{backer.name}</h3>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0 cursor-default">
                            <Sparkles className="h-3.5 w-3.5 text-accent/60" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          ✨ Verified via database enrichment
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {backer.slogan && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{backer.slogan}</p>
                    )}
                    {websiteHref && (
                      <a
                        href={websiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 w-fit"
                      >
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        {cleanDomain(backer.website!)}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Entity Type – shows current type with switch link */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Investor Type</label>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
                    {entityType === "firm" ? (
                      <>
                        <Building2 className="h-3.5 w-3.5 text-foreground" />
                        <span className="text-sm font-medium text-foreground flex-1">Firm</span>
                        <button
                          type="button"
                          onClick={() => setEntityType("person")}
                          className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors"
                        >
                          Switch to Person →
                        </button>
                      </>
                    ) : (
                      <>
                        <User className="h-3.5 w-3.5 text-foreground" />
                        <span className="text-sm font-medium text-foreground flex-1">Person</span>
                        <button
                          type="button"
                          onClick={() => setEntityType("firm")}
                          className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors"
                        >
                          Switch to Firm →
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Conditional: Person Role */}
                {entityType === "person" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Investor Role</label>
                    <Select value={personRole} onValueChange={setPersonRole}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10 hover:border-border/80 transition-colors">
                        <SelectValue placeholder="Select role…" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999] rounded-xl">
                        {PERSON_ROLES.map(r => (
                          <SelectItem key={r} value={r} className="rounded-lg">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Conditional: Associated Syndicate/Firm (Person only) */}
                {entityType === "person" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Associated Syndicate / Firm</label>
                    <EntityCombobox
                      value={associatedFirm}
                      onChange={setAssociatedFirm}
                      placeholder="Are they investing via a specific entity? (Optional)"
                      label="Firm"
                      searchType="firm"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Optional — link this person to an investing entity, or{" "}
                      <button type="button" onClick={() => setEntityType("firm")} className="text-accent hover:text-accent/80 font-medium transition-colors">
                        add a firm directly
                      </button>.
                    </p>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Investment Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                      value={amount}
                      onChange={e => {
                        setAmount(e.target.value.replace(/[^0-9.,mkMK]/g, ""));
                        if (amountError) setAmountError(null);
                      }}
                      placeholder="e.g. 1.5m or 50k"
                      className={cn(
                        "w-full rounded-xl border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all",
                        amountError
                          ? "border-destructive focus:ring-destructive/30"
                          : "border-border focus:ring-accent/30 focus:border-accent/40"
                      )}
                    />
                  </div>
                  {amountError && (
                    <p className="text-xs text-destructive mt-1">{amountError}</p>
                  )}
                </div>

                {/* Funding Round & Instrument – 2-column */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Funding Round</label>
                    <Select value={round} onValueChange={setRound}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10 hover:border-border/80 transition-colors">
                        <SelectValue placeholder="Select round…" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999] rounded-xl">
                        {FUNDING_ROUNDS.map(r => (
                          <SelectItem key={r} value={r} className="rounded-lg">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Instrument</label>
                    <Select value={instrument} onValueChange={setInstrument}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10 hover:border-border/80 transition-colors">
                        <SelectValue placeholder="Select type…" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999] rounded-xl">
                        {INVESTMENT_TYPES.map(t => (
                          <SelectItem key={t} value={t} className="rounded-lg">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Closing Date – Month & Year */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Closing Date</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={closingMonth} onValueChange={setClosingMonth}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10 hover:border-border/80 transition-colors">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999] rounded-xl">
                        {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                          <SelectItem key={m} value={m} className="rounded-lg">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={closingYear} onValueChange={setClosingYear}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10 hover:border-border/80 transition-colors">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999] rounded-xl">
                        {Array.from({ length: 11 }, (_, i) => String(2020 + i)).map(y => (
                          <SelectItem key={y} value={y} className="rounded-lg">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Conditional: Lead Partner (Firm only) — Searchable Combobox */}
                {entityType === "firm" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Lead Partner</label>
                    <EntityCombobox
                      value={leadPartner}
                      onChange={setLeadPartner}
                      placeholder="Search partners or add new (Optional)"
                      label="Partner"
                      searchType="person"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Who is your point of contact or board member at this firm?</p>

                    {/* Inline Value Nudge — collapses when lead partner is filled */}
                    <AnimatePresence>
                      {!leadPartner && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                            <span className="text-sm text-indigo-900"><strong>Who championed this deal?</strong> Add the lead partner to unlock smarter network matches.</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-secondary/20">
                <button
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2"
                  >
                    {saving && <span className="h-3.5 w-3.5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
