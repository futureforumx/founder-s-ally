import { useEffect, useMemo, useRef, useState } from "react";
import { suggestHqCities, suggestHqCountries, suggestHqStates, type HqSuggestion } from "@/lib/hqPlaceSuggestions";

const INPUT_CLASS = "w-full rounded px-3 py-1.5 text-[12px] text-white/80 focus:outline-none transition-colors";
const INPUT_STYLE: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" };
const INPUT_FOCUS: React.CSSProperties = { ...INPUT_STYLE, borderColor: "rgba(46,230,166,0.4)" };

type HqPatch = { hq_city?: string | null; hq_state?: string | null; hq_country?: string | null };
type ActiveField = "city" | "state" | "country";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function CompanyHqFields({
  city,
  state,
  country,
  onChange,
}: {
  city: string | null;
  state: string | null;
  country: string | null;
  onChange: (patch: HqPatch) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveField | null>(null);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    if (active === "city") return suggestHqCities(city ?? "", country, state);
    if (active === "state") return suggestHqStates(state ?? "", country);
    if (active === "country") return suggestHqCountries(country ?? "");
    return [];
  }, [active, city, state, country]);

  useEffect(() => { setHighlight(0); }, [active, city, state, country]);

  const closeSoon = () => {
    window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      setActive(null);
    }, 120);
  };

  const pick = (suggestion: HqSuggestion) => {
    if (active === "city") {
      onChange({
        hq_city: suggestion.city ?? suggestion.label,
        ...(suggestion.state ? { hq_state: suggestion.state } : {}),
        ...(suggestion.country ? { hq_country: suggestion.country } : {}),
      });
    } else if (active === "state") {
      onChange({
        hq_state: suggestion.state ?? suggestion.label,
        ...(suggestion.country ? { hq_country: suggestion.country } : {}),
      });
    } else if (active === "country") {
      onChange({ hq_country: suggestion.country ?? suggestion.label });
    }
    setActive(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && suggestions[highlight]) {
      event.preventDefault();
      pick(suggestions[highlight]);
    }
  };

  const query = active === "city" ? (city ?? "") : active === "state" ? (state ?? "") : (country ?? "");
  const showList = active != null && query.trim().length >= (active === "city" ? 2 : 1);

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <div className="grid grid-cols-3 gap-2">
        <FieldLabel label="HQ City">
          <input
            className={INPUT_CLASS}
            style={active === "city" ? INPUT_FOCUS : INPUT_STYLE}
            value={city ?? ""}
            aria-autocomplete="list"
            aria-expanded={active === "city" && showList}
            onChange={(event) => { setActive("city"); onChange({ hq_city: event.target.value }); }}
            onFocus={() => setActive("city")}
            onBlur={closeSoon}
            onKeyDown={onKeyDown}
          />
        </FieldLabel>
        <FieldLabel label="HQ State">
          <input
            className={INPUT_CLASS}
            style={active === "state" ? INPUT_FOCUS : INPUT_STYLE}
            value={state ?? ""}
            aria-autocomplete="list"
            aria-expanded={active === "state" && showList}
            onChange={(event) => { setActive("state"); onChange({ hq_state: event.target.value }); }}
            onFocus={() => setActive("state")}
            onBlur={closeSoon}
            onKeyDown={onKeyDown}
          />
        </FieldLabel>
        <FieldLabel label="HQ Country">
          <input
            className={INPUT_CLASS}
            style={active === "country" ? INPUT_FOCUS : INPUT_STYLE}
            value={country ?? ""}
            aria-autocomplete="list"
            aria-expanded={active === "country" && showList}
            onChange={(event) => { setActive("country"); onChange({ hq_country: event.target.value }); }}
            onFocus={() => setActive("country")}
            onBlur={closeSoon}
            onKeyDown={onKeyDown}
          />
        </FieldLabel>
      </div>
      {showList && (
        <div
          role="listbox"
          aria-label={active === "city" ? "HQ city suggestions" : active === "state" ? "HQ state suggestions" : "HQ country suggestions"}
          className="max-h-52 overflow-y-auto rounded"
          style={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {suggestions.length === 0 && (
            <div className="px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              No matches. You can keep this text.
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.key}
              type="button"
              role="option"
              aria-selected={index === highlight}
              className="block w-full px-3 py-1.5 text-left hover:bg-white/[0.04]"
              style={{ background: index === highlight ? "rgba(46,230,166,0.1)" : undefined }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => pick(suggestion)}
            >
              <span className="block truncate text-[12px]" style={{ color: "rgba(255,255,255,0.86)" }}>{suggestion.label}</span>
              {suggestion.detail && (
                <span className="block truncate text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{suggestion.detail}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
