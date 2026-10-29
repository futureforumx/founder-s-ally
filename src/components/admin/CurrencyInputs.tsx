import { useEffect, useRef, useState, type CSSProperties } from "react";

type CurrencySuffix = "k" | "m" | "b" | null;
type ParsedCurrency = { valid: boolean; amount: number | null; suffix: CurrencySuffix };

export function parseCurrencyAmount(raw: string): ParsedCurrency {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, amount: null, suffix: null };
  const cleaned = trimmed.replace(/[$€£¥,\s]/g, "");
  const match = cleaned.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([kmb])?$/i);
  if (!match) return { valid: false, amount: null, suffix: null };
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return { valid: false, amount: null, suffix: null };
  const suffix = (match[2]?.toLowerCase() ?? null) as CurrencySuffix;
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  const amount = number * multiplier;
  return Number.isFinite(amount) ? { valid: true, amount, suffix } : { valid: false, amount: null, suffix: null };
}

function groupedAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function expandCurrencyText(raw: string): string {
  const parsed = parseCurrencyAmount(raw);
  if (!parsed.valid || parsed.amount == null) return raw;
  const symbol = raw.trim().match(/^\s*([$€£¥])/)?.[1] ?? "";
  return `${symbol}${groupedAmount(parsed.amount)}`;
}

type SharedInputProps = {
  className: string;
  style: CSSProperties;
  focusStyle: CSSProperties;
  placeholder?: string;
};

export function CurrencyNumberInput({ value, onChange, className, style, focusStyle, placeholder }: SharedInputProps & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(() => groupedAmount(value ?? null));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(groupedAmount(value ?? null));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      placeholder={placeholder}
      className={className}
      style={style}
      onFocus={event => {
        focused.current = true;
        setText(value == null ? "" : String(value));
        Object.assign(event.currentTarget.style, focusStyle);
      }}
      onChange={event => {
        const raw = event.currentTarget.value;
        setText(raw);
        const parsed = parseCurrencyAmount(raw);
        if (parsed.valid) onChange(parsed.amount);
      }}
      onBlur={event => {
        focused.current = false;
        const parsed = parseCurrencyAmount(text);
        if (parsed.valid) {
          onChange(parsed.amount);
          setText(groupedAmount(parsed.amount));
        } else {
          setText(groupedAmount(value ?? null));
        }
        Object.assign(event.currentTarget.style, style);
      }}
    />
  );
}

export function CurrencyStringInput({ value, onChange, className, style, focusStyle, placeholder }: SharedInputProps & {
  value: string | null | undefined;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value ?? "");
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      placeholder={placeholder}
      className={className}
      style={style}
      onFocus={event => {
        focused.current = true;
        Object.assign(event.currentTarget.style, focusStyle);
      }}
      onChange={event => {
        const raw = event.currentTarget.value;
        setText(raw);
        onChange(raw);
      }}
      onBlur={event => {
        focused.current = false;
        const expanded = expandCurrencyText(text);
        setText(expanded);
        if (expanded !== text) onChange(expanded);
        Object.assign(event.currentTarget.style, style);
      }}
    />
  );
}
