import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const MIN_AMOUNT = 1_000;
const MAX_AMOUNT = 50_000_000;

/** Parse shorthand like "1.5m", "50k", "500000" into a number */
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

/** Format number to compact display: $1.5M, $500k, $0 */
export function formatCompactCurrency(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

interface InlineAmountInputProps {
  value: number;
  displayLabel: string;
  backerId: string;
  onConfirm: (amount: number) => void;
}

export function InlineAmountInput({ value, displayLabel, backerId, onConfirm }: InlineAmountInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    setEditing(true);
    setText(value > 0 ? formatCompactCurrency(value).replace("$", "") : "");
    setError(null);
  };

  useEffect(() => {
    if (editing) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing]);

  // Position error tooltip
  useEffect(() => {
    if (error && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [error]);

  const tryConfirm = useCallback(() => {
    const parsed = parseShorthand(text);

    if (parsed === null && text.trim() === "") {
      // Allow clearing to 0
      setError(null);
      setEditing(false);
      onConfirm(0);
      return;
    }

    if (parsed === null) {
      setError("Invalid format. Try 1.5M or 50k");
      return;
    }

    if (parsed < MIN_AMOUNT || parsed > MAX_AMOUNT) {
      setError("Must be $1k – $50M");
      return;
    }

    setError(null);
    setEditing(false);
    onConfirm(parsed);
  }, [text, onConfirm]);

  const cancel = () => {
    setEditing(false);
    setError(null);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryConfirm();
    } else if (e.key === "Escape") {
      cancel();
    }
  };

  const errorTooltip =
    error
      ? createPortal(
          <div
            className="fixed px-2.5 py-1 rounded-md text-xs font-medium"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              zIndex: 9999,
              background: "hsl(0, 70%, 96%)",
              color: "hsl(0, 70%, 45%)",
              border: "1px solid hsl(0, 70%, 85%)",
              boxShadow: "0 4px 12px hsla(0, 0%, 0%, 0.08)",
            }}
          >
            {error}
          </div>,
          document.body
        )
      : null;

  if (!editing) {
    return (
      <button
        onClick={startEdit}
        className="text-sm font-bold text-foreground font-mono cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors hover:bg-secondary block text-right w-full"
      >
        {displayLabel}
      </button>
    );
  }

  return (
    <>
      <div ref={containerRef}>
        <input
          ref={inputRef}
          id={`amount-input-${backerId}`}
          value={text}
          onChange={e => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onBlur={tryConfirm}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 1.5M, 50k"
          className="w-full min-w-[120px] text-sm font-mono px-3 py-1.5 rounded-md outline-none transition-all"
          style={{
            background: "hsl(var(--background))",
            border: `1px solid ${error ? "hsl(0, 70%, 60%)" : "hsl(210, 60%, 70%)"}`,
            boxShadow: `0 0 0 2px ${error ? "hsla(0, 70%, 85%, 0.5)" : "hsla(210, 60%, 85%, 0.5)"}`,
            color: "hsl(var(--foreground))",
          }}
        />
      </div>
      {errorTooltip}
    </>
  );
}
