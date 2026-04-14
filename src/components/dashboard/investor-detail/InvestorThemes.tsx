import { useState, useMemo, useEffect } from "react";
import { Flame, TrendingUp, ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";

interface InvestorThemesProps {
  currentThesis?: string;
  recentDeals?: string[];
  firmName?: string;
  firmWebsiteUrl?: string | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface Theme {
  label: string;
  signal: "thesis" | "deals" | "both";
  heat: number;
}

const THEME_KEYWORDS = [
  "agentic ai", "vertical ai", "ai infrastructure", "ai-native", "applied ai",
  "generative ai", "llm", "autonomous agents", "machine learning",
  "healthcare", "healthtech", "biotech", "medtech",
  "fintech", "payments", "defi", "crypto", "web3", "blockchain",
  "climate tech", "cleantech", "sustainability", "decarbonization",
  "saas", "b2b", "enterprise software", "developer tools", "devtools",
  "cybersecurity", "defense tech", "govtech",
  "proptech", "construction tech", "real estate",
  "edtech", "future of work", "hr tech",
  "logistics", "supply chain", "manufacturing",
  "consumer", "marketplace", "d2c", "social",
  "robotics", "automation", "hardware", "deep tech",
  "data infrastructure", "cloud", "edge computing",
  "food tech", "agtech", "agriculture",
];

function extractThemes(thesis: string, deals: string[]): Theme[] {
  const combined = `${thesis} ${deals.join(" ")}`.toLowerCase();
  const thesisLower = thesis.toLowerCase();
  const dealsLower = deals.join(" ").toLowerCase();
  const found: Theme[] = [];
  for (const kw of THEME_KEYWORDS) {
    if (combined.includes(kw)) {
      const inThesis = thesisLower.includes(kw);
      const inDeals = dealsLower.includes(kw);
      found.push({
        label: kw.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        signal: inThesis && inDeals ? "both" : inThesis ? "thesis" : "deals",
        heat: inThesis && inDeals ? 1 : inThesis ? 0.8 : 0.6,
      });
    }
  }
  return found
    .filter((t, i) => !found.some((o, j) => j !== i && o.label.length > t.label.length && o.label.toLowerCase().includes(t.label.toLowerCase())))
    .sort((a, b) => b.heat - a.heat);
}

const DEFAULT_VISIBLE = 4;

export function InvestorThemes({
  currentThesis = "",
  recentDeals = [],
  firmName,
  firmWebsiteUrl,
  isExpanded = false,
  onToggleExpand,
}: InvestorThemesProps) {
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [websiteThemes, setWebsiteThemes] = useState<string[]>([]);

  useEffect(() => {
    const hasLocalSignals = (currentThesis || "").trim().length > 0 || (recentDeals?.length ?? 0) > 0;
    if (hasLocalSignals || !(firmWebsiteUrl || "").trim()) {
      setWebsiteThemes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/firm-website-themes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: firmWebsiteUrl }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { themes?: string[] };
        if (!cancelled) setWebsiteThemes(Array.isArray(data.themes) ? data.themes : []);
      } catch {
        if (!cancelled) setWebsiteThemes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentThesis, recentDeals, firmWebsiteUrl]);

  const themes = useMemo(() => {
    const fromSignals = extractThemes(currentThesis, recentDeals);
    if (fromSignals.length > 0) return fromSignals;
    return websiteThemes.map((label) => ({ label, signal: "thesis" as const, heat: 0.75 }));
  }, [currentThesis, recentDeals, websiteThemes]);
  const visible = isListExpanded ? themes : themes.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = themes.length - DEFAULT_VISIBLE;

  return (
    <div className={`rounded-xl border border-border bg-card p-3 space-y-2 ${isExpanded ? "h-[calc(100vh-280px)] max-h-[520px]" : ""}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">
          Current Themes
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 tracking-wider uppercase">
            <Flame className="w-3 h-3 text-orange-400" />
            Live Signals
          </div>
          {onToggleExpand && (
            <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/50 border border-border">
          <TrendingUp className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <p className="text-xs text-muted-foreground">Theme signals will appear as enrichment data is gathered.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {visible.map((t) => (
              <span
                key={t.label}
                className={`whitespace-nowrap px-2 py-1 rounded-full text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-default ${
                  t.signal === "both"
                    ? "bg-orange-100 border border-orange-200 text-orange-700"
                    : t.signal === "thesis"
                      ? "bg-amber-50 border border-amber-200 text-amber-700"
                      : "bg-slate-100 border border-slate-200 text-slate-600"
                }`}
              >
                {t.signal === "both" && <Flame className="w-2.5 h-2.5 shrink-0" />}
                {t.label}
              </span>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setIsListExpanded((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              {isListExpanded ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show all {themes.length} <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground/40">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Thesis + Deals</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Thesis Only</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Deals Only</span>
          </div>
        </>
      )}
    </div>
  );
}
