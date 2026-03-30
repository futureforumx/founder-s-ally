import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronsUpDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fuzzyMatch, calculateMatchScore } from "@/lib/fuzzyMatch";

export interface ComboboxOption {
  value: string;
  label: string;
  desc?: string;
}

interface SmartComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  verified?: boolean;
  className?: string;
  highlightSync?: boolean;
  /** Marks the control as required for accessibility / constraint validation. */
  required?: boolean;
  /** Highlights the field as invalid (e.g. after a failed submit). */
  invalid?: boolean;
  maxLength?: number;
}

export function SmartCombobox({
  value,
  onChange,
  onBlur,
  options,
  placeholder = "Select or type...",
  verified = false,
  className,
  highlightSync = false,
  required = false,
  invalid = false,
  maxLength,
}: SmartComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const query = search || value;
  const filtered = options
    .filter(
      (opt) =>
        fuzzyMatch(query, opt.label) ||
        fuzzyMatch(query, opt.desc || "")
    )
    .sort((a, b) => {
      const scoreA = calculateMatchScore(query, a.label, a.desc);
      const scoreB = calculateMatchScore(query, b.label, b.desc);
      return scoreB - scoreA;
    });

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setSearch("");
      setOpen(false);
      onBlur?.(val);
    },
    [onChange, onBlur]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearch(v);
    onChange(v);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
    setSearch("");
  };

  const handleInputBlur = () => {
    // Delay to allow click on option
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        const currentValue = search || value;
        setOpen(false);
        setSearch("");
        onBlur?.(currentValue);
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (filtered.length === 1) {
        handleSelect(filtered[0].value);
      } else {
        const currentValue = search || value;
        setOpen(false);
        setSearch("");
        onBlur?.(currentValue);
      }
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          value={open ? search || value : value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          className={cn(
            "flex w-full rounded-lg border bg-background px-3 py-1.5 text-sm h-9",
            "ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "border-input",
            highlightSync && !invalid && "ring-2 ring-accent ring-offset-2 ring-offset-background",
            invalid &&
              "border-amber-500 ring-2 ring-amber-500/40 ring-offset-2 ring-offset-background focus-visible:ring-amber-500/50 dark:border-amber-400 dark:ring-amber-400/35",
            verified ? "pr-16" : "pr-8"
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {verified && (
            <span className="flex items-center gap-0.5 text-success">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-[8px] font-mono uppercase font-bold tracking-wider">Synced</span>
            </span>
          )}
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        </div>
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute z-50 mt-1 w-full rounded-lg border border-border",
              "bg-popover/95 backdrop-blur-xl shadow-lg",
              "max-h-[200px] overflow-y-auto"
            )}
          >
            {filtered.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt.value);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    "hover:bg-accent/10 transition-colors",
                    isSelected && "bg-accent/5"
                  )}
                >
                  <Check
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isSelected ? "text-accent opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground">{opt.label}</p>
                    {opt.desc && (
                      <p className="text-[10px] text-muted-foreground truncate">{opt.desc}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
