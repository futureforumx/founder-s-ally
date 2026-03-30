import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, X } from "lucide-react";

// ── Top startup hubs + aliases ──

const LOCATIONS = [
  "San Francisco, CA, United States", "New York City, NY, United States", "Los Angeles, CA, United States",
  "San Diego, CA, United States", "San Jose, CA, United States", "San Antonio, TX, United States",
  "Seattle, WA, United States", "Austin, TX, United States", "Boston, MA, United States",
  "Chicago, IL, United States", "Denver, CO, United States", "Miami, FL, United States",
  "Atlanta, GA, United States", "Washington, DC, United States", "Dallas, TX, United States",
  "Houston, TX, United States", "Phoenix, AZ, United States", "Portland, OR, United States",
  "Minneapolis, MN, United States", "Nashville, TN, United States", "Raleigh, NC, United States",
  "Salt Lake City, UT, United States", "Detroit, MI, United States", "Philadelphia, PA, United States",
  "Charlotte, NC, United States", "Pittsburgh, PA, United States", "Columbus, OH, United States",
  "Indianapolis, IN, United States", "Kansas City, MO, United States", "St. Louis, MO, United States",
  "Tampa, FL, United States", "Orlando, FL, United States", "Las Vegas, NV, United States",
  "Honolulu, HI, United States", "Boise, ID, United States",
  "London, England, United Kingdom", "Manchester, England, United Kingdom", "Edinburgh, Scotland, United Kingdom",
  "Cambridge, England, United Kingdom", "Bristol, England, United Kingdom", "Oxford, England, United Kingdom",
  "Berlin, Germany", "Munich, Germany", "Hamburg, Germany", "Frankfurt, Germany",
  "Paris, France", "Lyon, France", "Toulouse, France",
  "Amsterdam, Netherlands", "Rotterdam, Netherlands",
  "Stockholm, Sweden", "Gothenburg, Sweden",
  "Copenhagen, Denmark", "Helsinki, Finland", "Oslo, Norway",
  "Dublin, Ireland", "Barcelona, Spain", "Madrid, Spain",
  "Lisbon, Portugal", "Milan, Italy", "Rome, Italy",
  "Zurich, Switzerland", "Geneva, Switzerland", "Vienna, Austria",
  "Brussels, Belgium", "Warsaw, Poland", "Prague, Czech Republic",
  "Tallinn, Estonia", "Riga, Latvia", "Bucharest, Romania",
  "Toronto, ON, Canada", "Vancouver, BC, Canada", "Montreal, QC, Canada",
  "Waterloo, ON, Canada", "Calgary, AB, Canada", "Ottawa, ON, Canada",
  "São Paulo, Brazil", "Rio de Janeiro, Brazil", "Bogotá, Colombia",
  "Mexico City, Mexico", "Buenos Aires, Argentina", "Santiago, Chile",
  "Lima, Peru", "Medellín, Colombia",
  "Tel Aviv, Israel", "Jerusalem, Israel",
  "Dubai, UAE", "Abu Dhabi, UAE", "Riyadh, Saudi Arabia",
  "Bangalore, Karnataka, India", "Mumbai, Maharashtra, India", "Delhi, India",
  "Hyderabad, India", "Chennai, India", "Pune, India", "Gurgaon, India",
  "Singapore", "Kuala Lumpur, Malaysia", "Jakarta, Indonesia",
  "Bangkok, Thailand", "Ho Chi Minh City, Vietnam", "Manila, Philippines",
  "Tokyo, Japan", "Osaka, Japan", "Seoul, South Korea", "Busan, South Korea",
  "Beijing, China", "Shanghai, China", "Shenzhen, China", "Hangzhou, China", "Hong Kong",
  "Taipei, Taiwan",
  "Sydney, NSW, Australia", "Melbourne, VIC, Australia", "Brisbane, QLD, Australia",
  "Auckland, New Zealand",
  "Lagos, Nigeria", "Nairobi, Kenya", "Cape Town, South Africa",
  "Johannesburg, South Africa", "Cairo, Egypt", "Accra, Ghana", "Kigali, Rwanda",
  // Country-only entries
  "United States", "United Kingdom", "Germany", "France", "Canada", "India",
  "Australia", "Japan", "South Korea", "China", "Brazil", "Israel", "Singapore",
  "Netherlands", "Sweden", "Denmark", "Finland", "Norway", "Ireland", "Spain",
  "Portugal", "Italy", "Switzerland", "UAE", "Saudi Arabia", "Nigeria", "Kenya",
  "South Africa", "Indonesia", "Thailand", "Vietnam", "Philippines", "Malaysia",
  "Mexico", "Argentina", "Chile", "Colombia", "Peru", "Taiwan", "New Zealand",
  "Poland", "Czech Republic", "Estonia", "Romania", "Austria", "Belgium", "Egypt", "Ghana", "Rwanda",
];

const ALIASES: Record<string, string> = {
  "us": "United States", "usa": "United States", "u.s.": "United States", "u.s.a.": "United States",
  "uk": "United Kingdom", "u.k.": "United Kingdom", "britain": "United Kingdom", "england": "United Kingdom",
  "nyc": "New York City, NY, United States", "ny": "New York City, NY, United States",
  "sf": "San Francisco, CA, United States", "sfo": "San Francisco, CA, United States",
  "la": "Los Angeles, CA, United States", "dc": "Washington, DC, United States",
  "hk": "Hong Kong", "sg": "Singapore", "uae": "UAE",
  "bay area": "San Francisco, CA, United States", "silicon valley": "San Francisco, CA, United States",
};

function matchLocations(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Check alias first
  const aliasMatch = ALIASES[q];
  const results: string[] = [];
  if (aliasMatch) results.push(aliasMatch);

  // Prefix match (prioritized)
  for (const loc of LOCATIONS) {
    if (results.length >= limit) break;
    if (loc.toLowerCase().startsWith(q) && !results.includes(loc)) results.push(loc);
  }

  // Contains match
  for (const loc of LOCATIONS) {
    if (results.length >= limit) break;
    if (loc.toLowerCase().includes(q) && !results.includes(loc)) results.push(loc);
  }

  return results;
}

function topLocations(limit = 8): string[] {
  return LOCATIONS.slice(0, limit);
}

// ── Highlight helper ──

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

// ── Component ──

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationAutocomplete({ value, onChange, placeholder = "San Francisco, CA", className }: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = q.trim();
      const r = trimmed ? matchLocations(trimmed) : topLocations();
      setResults(r);
      setActiveIdx(-1);
      setOpen(r.length > 0);
    }, 150);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    search(v);
  };

  const select = (loc: string) => {
    setQuery(loc);
    onChange(loc);
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); select(results[activeIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { search(query); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={100}
          className={className}
          autoComplete="off"
        />
        {query && (
          <button onClick={clear} type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {results.map((loc, i) => (
            <button
              key={loc}
              type="button"
              onClick={() => select(loc)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                i === activeIdx ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent/60" />
              <span className="truncate">
                <HighlightMatch text={loc} query={query} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
