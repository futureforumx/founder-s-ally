import { useState, useRef, useEffect } from "react";
import { X, Plus, Sparkles, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CompetitorTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  isAiDraft?: boolean;
  aiTags?: string[]; // tags that were added by AI
  onAiTagConfirm?: (tag: string) => void;
}

// Known companies for autocomplete suggestions
const KNOWN_COMPANIES: { name: string; domain: string; series?: string; valuation?: string; overlap?: string }[] = [
  { name: "Procore", domain: "procore.com", series: "Public", valuation: "$9B+", overlap: "85%" },
  { name: "PlanGrid", domain: "plangrid.com", series: "Acquired", valuation: "$875M", overlap: "72%" },
  { name: "Autodesk", domain: "autodesk.com", series: "Public", valuation: "$50B+", overlap: "60%" },
  { name: "Buildertrend", domain: "buildertrend.com", series: "Series B", valuation: "$500M", overlap: "78%" },
  { name: "Fieldwire", domain: "fieldwire.com", series: "Acquired", valuation: "$300M", overlap: "70%" },
  { name: "Stripe", domain: "stripe.com", series: "Series I", valuation: "$50B+", overlap: "15%" },
  { name: "Salesforce", domain: "salesforce.com", series: "Public", valuation: "$200B+", overlap: "20%" },
  { name: "HubSpot", domain: "hubspot.com", series: "Public", valuation: "$25B+", overlap: "18%" },
  { name: "Notion", domain: "notion.so", series: "Series C", valuation: "$10B", overlap: "10%" },
  { name: "Asana", domain: "asana.com", series: "Public", valuation: "$5B+", overlap: "25%" },
  { name: "Monday.com", domain: "monday.com", series: "Public", valuation: "$8B+", overlap: "22%" },
  { name: "Figma", domain: "figma.com", series: "Acquired", valuation: "$20B", overlap: "5%" },
  { name: "Airtable", domain: "airtable.com", series: "Series F", valuation: "$11B", overlap: "12%" },
  { name: "Datadog", domain: "datadoghq.com", series: "Public", valuation: "$30B+", overlap: "8%" },
  { name: "Snowflake", domain: "snowflake.com", series: "Public", valuation: "$50B+", overlap: "5%" },
  { name: "Palantir", domain: "palantir.com", series: "Public", valuation: "$40B+", overlap: "10%" },
  { name: "OpenAI", domain: "openai.com", series: "Private", valuation: "$80B+", overlap: "15%" },
  { name: "Vercel", domain: "vercel.com", series: "Series D", valuation: "$2.5B", overlap: "5%" },
  { name: "Linear", domain: "linear.app", series: "Series B", valuation: "$400M", overlap: "8%" },
  { name: "Rippling", domain: "rippling.com", series: "Series E", valuation: "$13.5B", overlap: "12%" },
];

/**
 * Normalize any input (company name, domain, or full URL) into a clean bare domain.
 * e.g. "Outbuild", "outbuild.com", "https://www.outbuild.com/pricing" → "outbuild.com"
 */
function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  // Strip protocol + www. + path/query
  const stripped = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
  if (stripped.includes(".")) return stripped;
  // No dot → treat as company name — look up known list first
  const known = KNOWN_COMPANIES.find(c => c.name.toLowerCase() === stripped);
  if (known) return known.domain;
  return stripped + ".com";
}

/** Get a company info entry by name OR domain/URL — so both work for market-pulse tooltips */
function getCompanyInfo(input: string) {
  const lower = input.trim().toLowerCase();
  const domain = normalizeDomain(input);
  return KNOWN_COMPANIES.find(
    c =>
      c.name.toLowerCase() === lower ||
      c.domain.toLowerCase() === lower ||
      c.domain.toLowerCase() === domain
  );
}

function faviconUrl(input: string) {
  const domain = normalizeDomain(input);
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
}

/** Best display label for a tag: canonical company name if known, otherwise the raw input */
function displayLabel(tag: string): string {
  const info = getCompanyInfo(tag);
  return info ? info.name : tag;
}

export function CompetitorTagInput({ tags, onChange, isAiDraft, aiTags = [], onAiTagConfirm }: CompetitorTagInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<typeof KNOWN_COMPANIES>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAiTag = (tag: string) => aiTags.includes(tag);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setSelectedIdx(0);
      return;
    }
    const q = value.toLowerCase();
    const matches = KNOWN_COMPANIES.filter(
      c => c.name.toLowerCase().includes(q) && !tags.includes(c.name)
    ).slice(0, 5);
    setSuggestions(matches);
    setSelectedIdx(0);
  }, [value, tags]);

  const addTag = (name: string) => {
    const t = name.trim();
    if (!t || tags.includes(t)) { setValue(""); return; }
    onChange([...tags, t]);
    if (onAiTagConfirm && isAiTag(t)) onAiTagConfirm(t);
    setValue("");
    setSuggestions([]);
    setIsAdding(false);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const confirmAiTag = (tag: string) => {
    if (onAiTagConfirm) onAiTagConfirm(tag);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        addTag(suggestions[selectedIdx].name);
      } else {
        addTag(value);
      }
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setValue("");
      setSuggestions([]);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-3 py-2 min-h-[38px] transition-colors ${isAiDraft ? "bg-accent/5 border-accent/20" : "bg-background"}`}>
      {tags.map(tag => {
        const domain = getDomain(tag);
        const info = getCompanyInfo(tag);
        const ai = isAiTag(tag);

        const pill = (
          <div
            key={tag}
            className="group flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm transition-all hover:shadow-md"
          >
            <img
              src={faviconUrl(domain)}
              alt=""
              className="h-3.5 w-3.5 rounded-sm"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span>{tag}</span>
            {ai && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); confirmAiTag(tag); }}
                    className="flex items-center text-accent hover:text-accent/80 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px]">
                  AI-discovered · Click to confirm
                </TooltipContent>
              </Tooltip>
            )}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
            >
              <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        );

        // Wrap with market pulse tooltip if we have info
        if (info) {
          return (
            <Tooltip key={tag} delayDuration={200}>
              <TooltipTrigger asChild>{pill}</TooltipTrigger>
              <TooltipContent side="top" className="p-0 overflow-hidden" sideOffset={8}>
                <div className="px-3 py-2 space-y-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <img src={faviconUrl(info.domain)} alt="" className="h-4 w-4 rounded-sm" />
                    <span className="text-xs font-semibold text-foreground">{info.name}</span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 ml-auto">
                      Market Pulse
                    </Badge>
                  </div>
                  <div className="border-t border-border my-1" />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                    <span className="text-muted-foreground">Series</span>
                    <span className="text-foreground font-medium text-right">{info.series}</span>
                    <span className="text-muted-foreground">Valuation</span>
                    <span className="text-foreground font-medium text-right">{info.valuation}</span>
                    <span className="text-muted-foreground">Direct Overlap</span>
                    <span className="text-foreground font-medium text-right">{info.overlap}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        }

        return pill;
      })}

      {/* Add button / input */}
      {isAdding ? (
        <div className="relative">
          <div className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5 border border-input">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                setTimeout(() => {
                  if (!value.trim()) { setIsAdding(false); setSuggestions([]); }
                }, 200);
              }}
              placeholder="Search company..."
              className="h-6 w-32 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden animate-fade-in"
            >
              {suggestions.map((s, idx) => (
                <button
                  key={s.name}
                  onMouseDown={(e) => { e.preventDefault(); addTag(s.name); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    idx === selectedIdx ? "bg-accent/10" : "hover:bg-muted/50"
                  }`}
                >
                  <img src={faviconUrl(s.domain)} alt="" className="h-4 w-4 rounded-sm shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.domain}</p>
                  </div>
                  {s.series && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
                      {s.series}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded-full border border-dashed border-border px-2 py-1 hover:border-foreground/30"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      )}
    </div>
  );
}
