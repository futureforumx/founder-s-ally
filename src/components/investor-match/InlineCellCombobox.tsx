import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface InlineCellComboboxProps {
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}

export function InlineCellCombobox({ value, options, onSelect }: InlineCellComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length, search]);

  // Position dropdown via portal
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [open]);

  // Click outside to close (check both trigger and portal dropdown)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
      setSearch("");
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

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed rounded-xl overflow-hidden"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 16px 48px hsla(var(--foreground), 0.12)",
          }}
        >
          <div className="p-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search…"
              className="w-full text-sm px-3 py-1.5 rounded-md text-foreground placeholder:text-muted-foreground outline-none"
              style={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(210, 60%, 70%)",
                boxShadow: "0 0 0 2px hsla(210, 60%, 85%, 0.5)",
              }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length > 0 ? (
              filtered.map((option, i) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    i === highlightIndex
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60"
                  } ${option === value ? "font-semibold text-foreground" : ""}`}
                >
                  {option}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">No matches</p>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="text-sm text-muted-foreground cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors hover:bg-secondary hover:text-foreground truncate block text-left"
      >
        {value || "Select…"}
      </button>
      {dropdown}
    </>
  );
}
