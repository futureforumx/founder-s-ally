import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";

interface InlineCellComboboxProps {
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}

export function InlineCellCombobox({ value, options, onSelect }: InlineCellComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length, search]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = useCallback((val: string) => {
    onSelect(val);
    setOpen(false);
    setSearch("");
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-muted-foreground cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <span className="truncate">{value || "Select…"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-0 group-hover/row:opacity-60 transition-opacity" />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-56 rounded-xl overflow-hidden z-30"
          style={{
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 12px 40px hsla(var(--foreground), 0.08)",
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search…"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-secondary text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length > 0 ? (
              filtered.map((option, i) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    i === highlightIndex
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60"
                  } ${option === value ? "font-semibold text-foreground" : ""}`}
                >
                  {option}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
