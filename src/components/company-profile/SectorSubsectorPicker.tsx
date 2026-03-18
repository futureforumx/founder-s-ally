import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronDown, Sparkles, Search } from "lucide-react";
import { SECTOR_TAXONOMY, sectors, subsectorsFor } from "./types";
import { Badge } from "@/components/ui/badge";

// Synonym mapping for search — maps common terms to sectors/subsectors
const SYNONYMS: Record<string, { sector: string; subsector?: string }[]> = {
  // Construction & Real Estate
  "construction": [{ sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" }],
  "contech": [{ sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" }],
  "proptech": [{ sector: "Construction & Real Estate", subsector: "PropTech" }],
  "real estate": [{ sector: "Construction & Real Estate", subsector: "PropTech" }],
  "property": [{ sector: "Construction & Real Estate", subsector: "PropTech" }],
  "bim": [{ sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" }],
  "digital twin": [{ sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" }],
  "building": [{ sector: "Construction & Real Estate" }],

  // Industrial & Manufacturing
  "robotics": [{ sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" }],
  "automation": [{ sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" }],
  "factory": [{ sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" }],
  "industry 4.0": [{ sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" }],
  "warehouse": [{ sector: "Industrial & Manufacturing", subsector: "Warehousing Tech" }],
  "3d printing": [{ sector: "Industrial & Manufacturing", subsector: "3D Printing" }],
  "additive": [{ sector: "Industrial & Manufacturing", subsector: "3D Printing" }],
  "supply chain": [{ sector: "Industrial & Manufacturing", subsector: "Supply Chain Tech" }],
  "logistics": [{ sector: "Industrial & Manufacturing", subsector: "Supply Chain Tech" }],
  "manufacturing": [{ sector: "Industrial & Manufacturing" }],

  // Enterprise Software & SaaS — "saas" and "software" are cross-cutting
  "saas": [
    { sector: "Enterprise Software & SaaS" },
    { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
    { sector: "Construction & Real Estate", subsector: "PropTech" },
  ],
  "software": [
    { sector: "Enterprise Software & SaaS" },
    { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
    { sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" },
  ],
  "cybersecurity": [{ sector: "Enterprise Software & SaaS", subsector: "Cybersecurity" }],
  "security": [{ sector: "Enterprise Software & SaaS", subsector: "Cybersecurity" }],
  "devtools": [{ sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" }],
  "open source": [{ sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" }],
  "hr": [{ sector: "Enterprise Software & SaaS", subsector: "HRTech" }],
  "hiring": [{ sector: "Enterprise Software & SaaS", subsector: "HRTech" }],
  "marketing": [{ sector: "Enterprise Software & SaaS", subsector: "MarTech" }],
  "legaltech": [{ sector: "Enterprise Software & SaaS", subsector: "LegalTech" }],
  "legal": [{ sector: "Enterprise Software & SaaS", subsector: "LegalTech" }],
  "crm": [{ sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" }],
  "erp": [{ sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" }],

  // Artificial Intelligence
  "gpt": [{ sector: "Artificial Intelligence", subsector: "LLMOps & Infrastructure" }],
  "llm": [{ sector: "Artificial Intelligence", subsector: "LLMOps & Infrastructure" }],
  "chatbot": [{ sector: "Artificial Intelligence", subsector: "Vertical AI Agents" }],
  "agent": [{ sector: "Artificial Intelligence", subsector: "Vertical AI Agents" }],
  "copilot": [{ sector: "Artificial Intelligence", subsector: "Vertical AI Agents" }],
  "machine learning": [{ sector: "Artificial Intelligence" }],
  "ml": [{ sector: "Artificial Intelligence" }],
  "neural": [{ sector: "Artificial Intelligence" }],
  "diffusion": [{ sector: "Artificial Intelligence", subsector: "Generative Media" }],
  "image generation": [{ sector: "Artificial Intelligence", subsector: "Generative Media" }],
  "edge ai": [{ sector: "Artificial Intelligence", subsector: "Edge AI" }],
  "ai safety": [{ sector: "Artificial Intelligence", subsector: "AI Safety & Governance" }],

  // Fintech
  "bitcoin": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "crypto": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "blockchain": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "web3": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "rwa": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "tokenization": [{ sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" }],
  "wallet": [{ sector: "Fintech", subsector: "Payments Infrastructure" }],
  "stripe": [{ sector: "Fintech", subsector: "Payments Infrastructure" }],
  "payment": [{ sector: "Fintech", subsector: "Payments Infrastructure" }],
  "insurance": [{ sector: "Fintech", subsector: "Insurtech" }],
  "compliance": [{ sector: "Fintech", subsector: "RegTech" }],
  "kyc": [{ sector: "Fintech", subsector: "RegTech" }],
  "aml": [{ sector: "Fintech", subsector: "RegTech" }],
  "wealth": [{ sector: "Fintech", subsector: "WealthTech" }],
  "embedded finance": [{ sector: "Fintech", subsector: "Embedded Finance" }],

  // Climate & Energy
  "solar": [{ sector: "Climate & Energy", subsector: "Energy Storage" }],
  "wind": [{ sector: "Climate & Energy", subsector: "Energy Storage" }],
  "carbon": [{ sector: "Climate & Energy", subsector: "Carbon Capture" }],
  "battery": [{ sector: "Climate & Energy", subsector: "Energy Storage" }],
  "ev": [{ sector: "Climate & Energy", subsector: "Energy Storage" }],
  "grid": [{ sector: "Climate & Energy", subsector: "Grid Optimization" }],
  "farming": [{ sector: "Climate & Energy", subsector: "AgTech" }],
  "agriculture": [{ sector: "Climate & Energy", subsector: "AgTech" }],
  "water": [{ sector: "Climate & Energy", subsector: "Water Tech" }],

  // Health & Biotech
  "telehealth": [{ sector: "Health & Biotech", subsector: "Digital Health" }],
  "patient": [{ sector: "Health & Biotech", subsector: "Digital Health" }],
  "ehr": [{ sector: "Health & Biotech", subsector: "Digital Health" }],
  "drug": [{ sector: "Health & Biotech", subsector: "Biopharma" }],
  "pharma": [{ sector: "Health & Biotech", subsector: "Biopharma" }],
  "dna": [{ sector: "Health & Biotech", subsector: "Genomics" }],
  "genome": [{ sector: "Health & Biotech", subsector: "Genomics" }],
  "longevity": [{ sector: "Health & Biotech", subsector: "Longevity" }],
  "neuro": [{ sector: "Health & Biotech", subsector: "Neurotech" }],
  "brain": [{ sector: "Health & Biotech", subsector: "Neurotech" }],
  "medtech": [{ sector: "Health & Biotech", subsector: "MedTech" }],

  // Consumer & Retail
  "ecommerce": [{ sector: "Consumer & Retail", subsector: "E-commerce Infrastructure" }],
  "d2c": [{ sector: "Consumer & Retail", subsector: "E-commerce Infrastructure" }],
  "gaming": [{ sector: "Consumer & Retail", subsector: "Gaming & Interactive" }],
  "esport": [{ sector: "Consumer & Retail", subsector: "Gaming & Interactive" }],
  "education": [{ sector: "Consumer & Retail", subsector: "EdTech" }],
  "learning": [{ sector: "Consumer & Retail", subsector: "EdTech" }],
  "social": [{ sector: "Consumer & Retail", subsector: "Social Commerce" }],
  "creator": [{ sector: "Consumer & Retail", subsector: "Social Commerce" }],
  "adtech": [{ sector: "Consumer & Retail", subsector: "AdTech" }],
  "advertising": [{ sector: "Consumer & Retail", subsector: "AdTech" }],

  // Deep Tech & Space
  "quantum": [{ sector: "Deep Tech & Space", subsector: "Quantum Computing" }],
  "satellite": [{ sector: "Deep Tech & Space", subsector: "Satcom" }],
  "space": [{ sector: "Deep Tech & Space", subsector: "Space Infrastructure" }],
  "rocket": [{ sector: "Deep Tech & Space", subsector: "Space Infrastructure" }],
  "chip": [{ sector: "Deep Tech & Space", subsector: "Semiconductors" }],
  "semiconductor": [{ sector: "Deep Tech & Space", subsector: "Semiconductors" }],
  "photonics": [{ sector: "Deep Tech & Space", subsector: "Photonics" }],

  // Defense & GovTech
  "defense": [{ sector: "Defense & GovTech" }],
  "military": [{ sector: "Defense & GovTech", subsector: "National Security" }],
  "drone": [{ sector: "Defense & GovTech", subsector: "Drones & UAVs" }],
  "uav": [{ sector: "Defense & GovTech", subsector: "Drones & UAVs" }],
  "govtech": [{ sector: "Defense & GovTech", subsector: "Civic Engagement" }],
  "government": [{ sector: "Defense & GovTech", subsector: "Civic Engagement" }],
  "dual-use": [{ sector: "Defense & GovTech", subsector: "Dual-Use Tech" }],
  "public safety": [{ sector: "Defense & GovTech", subsector: "Public Safety" }],
};

// Find all synonym matches (exact + partial)
function findSynonymMatches(query: string): { sector: string; subsector?: string }[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: { sector: string; subsector?: string }[] = [];
  const seen = new Set<string>();
  for (const [key, matches] of Object.entries(SYNONYMS)) {
    if (key.includes(q) || q.includes(key)) {
      for (const m of matches) {
        const k = `${m.sector}::${m.subsector || ""}`;
        if (!seen.has(k)) { seen.add(k); results.push(m); }
      }
    }
  }
  return results;
}

/** Case-insensitive check if a subsector already exists in a list */
function subsectorExists(list: string[], candidate: string): boolean {
  const lower = candidate.toLowerCase().trim();
  return list.some(s => s.toLowerCase().trim() === lower);
}

/** Resolve a candidate subsector to its canonical taxonomy name */
function canonicalSubsector(candidate: string, sectorName?: string): string {
  const lower = candidate.toLowerCase().trim();
  // Check within specific sector first
  if (sectorName) {
    const match = subsectorsFor(sectorName).find(s => s.toLowerCase() === lower);
    if (match) return match;
  }
  // Check all sectors
  for (const s of sectors) {
    const match = subsectorsFor(s).find(sub => sub.toLowerCase() === lower);
    if (match) return match;
  }
  return candidate;
}

interface SectorSubsectorPickerProps {
  sector: string;
  subsectors: string[];
  onSectorChange: (sector: string) => void;
  onSubsectorsChange: (subsectors: string[]) => void;
  aiSuggestedSector?: string | null;
  aiSuggestedSubsectors?: string[];
  /** All AI suggestions (including overflow beyond 3) */
  aiOverflowSubsectors?: string[];
  onApplyAiSector?: () => void;
  isAiDraft?: boolean;
  className?: string;
}

export function SectorSubsectorPicker({
  sector,
  subsectors,
  onSectorChange,
  onSubsectorsChange,
  aiSuggestedSector,
  aiSuggestedSubsectors,
  aiOverflowSubsectors,
  onApplyAiSector,
  isAiDraft,
  className,
}: SectorSubsectorPickerProps) {
  const [showOverflow, setShowOverflow] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [subsectorOpen, setSubsectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [subsectorSearch, setSubsectorSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const sectorRef = useRef<HTMLDivElement>(null);
  const subsectorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const subsearchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sectorRef.current && !sectorRef.current.contains(e.target as Node)) setSectorOpen(false);
      if (subsectorRef.current && !subsectorRef.current.contains(e.target as Node)) setSubsectorOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (sectorOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [sectorOpen]);
  useEffect(() => {
    if (subsectorOpen) setTimeout(() => subsearchInputRef.current?.focus(), 50);
  }, [subsectorOpen]);

  // Filter sectors based on search + synonyms (with ranking)
  const getFilteredSectors = useCallback(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sectors;

    const synonymMatches = findSynonymMatches(q);
    const matchedSectors = new Set(synonymMatches.map(m => m.sector));

    // Also text-match on sector names and subsector names
    const textMatched = sectors.filter(s =>
      s.toLowerCase().includes(q) ||
      subsectorsFor(s).some(sub => sub.toLowerCase().includes(q))
    );
    textMatched.forEach(s => matchedSectors.add(s));

    if (matchedSectors.size === 0) return [];

    // Sort: synonym matches first, then text matches
    const synonymSectors = new Set(synonymMatches.map(m => m.sector));
    return sectors.filter(s => matchedSectors.has(s)).sort((a, b) => {
      const aS = synonymSectors.has(a) ? 0 : 1;
      const bS = synonymSectors.has(b) ? 0 : 1;
      return aS - bS;
    });
  }, [search]);

  // Build cross-sector subsector list for the dropdown
  // Shows primary sector subsectors first, then related subsectors from other sectors
  const getFilteredSubsectors = useCallback((): { subsector: string; fromSector: string; isRelated: boolean }[] => {
    if (!sector) return [];
    const q = subsectorSearch.toLowerCase().trim();

    // Primary sector subsectors
    const primary = subsectorsFor(sector).map(sub => ({ subsector: sub, fromSector: sector, isRelated: false }));

    // If searching, also find cross-sector matches
    let related: { subsector: string; fromSector: string; isRelated: boolean }[] = [];
    if (q) {
      const synonymMatches = findSynonymMatches(q);
      for (const match of synonymMatches) {
        if (match.subsector && match.sector !== sector) {
          related.push({ subsector: match.subsector, fromSector: match.sector, isRelated: true });
        }
      }
      // Also text-match subsectors from all sectors
      for (const s of sectors) {
        if (s === sector) continue;
        for (const sub of subsectorsFor(s)) {
          if (sub.toLowerCase().includes(q) && !related.some(r => r.subsector === sub && r.fromSector === s)) {
            related.push({ subsector: sub, fromSector: s, isRelated: true });
          }
        }
      }
    }

    // Also show already-selected cross-sector subsectors
    for (const sub of subsectors) {
      if (!primary.some(p => p.subsector === sub)) {
        // Find which sector it belongs to
        const ownerSector = sectors.find(s => subsectorsFor(s).includes(sub));
        if (ownerSector && !related.some(r => r.subsector === sub)) {
          related.push({ subsector: sub, fromSector: ownerSector, isRelated: true });
        }
      }
    }

    const all = [...primary, ...related];

    if (!q) return all;

    // Filter by search
    const synonymMatches = findSynonymMatches(q);
    const synonymSubs = new Set(synonymMatches.filter(m => m.subsector).map(m => m.subsector!));

    return all.filter(item =>
      item.subsector.toLowerCase().includes(q) || synonymSubs.has(item.subsector)
    );
  }, [sector, subsectorSearch, subsectors]);

  const filteredSectors = getFilteredSectors();
  const filteredSubsectors = getFilteredSubsectors();

  const handleSectorSelect = (s: string) => {
    onSectorChange(s);
    // Keep cross-sector subsectors, remove ones from old primary sector
    const kept = subsectors.filter(sub => {
      // Keep if it belongs to the new sector or to a different sector
      return subsectorsFor(s).includes(sub) || !subsectorsFor(sector).includes(sub);
    });
    onSubsectorsChange(kept);
    setSectorOpen(false);
    setSearch("");
    setFocusIdx(-1);
  };

  const toggleSubsector = (sub: string) => {
    const canonical = canonicalSubsector(sub, sector);
    // Case-insensitive dedup check
    if (subsectorExists(subsectors, canonical)) {
      onSubsectorsChange(subsectors.filter(s => s.toLowerCase() !== canonical.toLowerCase()));
    } else if (subsectors.length < 3) {
      onSubsectorsChange([...subsectors, canonical]);
    }
  };

  const removeSubsector = (sub: string) => {
    onSubsectorsChange(subsectors.filter(s => s !== sub));
  };

  // Determine the pill color — accent for primary sector, muted for cross-sector
  const getSubsectorPillStyle = (sub: string) => {
    const isPrimary = subsectorsFor(sector).includes(sub);
    return isPrimary
      ? "bg-accent/10 border-accent/20 text-accent"
      : "bg-muted border-border text-muted-foreground";
  };

  const handleSectorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setSectorOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(prev => Math.min(prev + 1, filteredSectors.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(prev => Math.max(prev - 1, 0)); }
    if (e.key === "Enter" && focusIdx >= 0 && focusIdx < filteredSectors.length) {
      e.preventDefault();
      handleSectorSelect(filteredSectors[focusIdx]);
    }
  };

  const showAiAlt = aiSuggestedSector && aiSuggestedSector !== sector && onApplyAiSector;

  return (
    <div className={`space-y-3 ${className || ""}`}>
      {/* Sector Combobox */}
      <div ref={sectorRef} className="relative">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
          Sector
          {isAiDraft && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-accent/10 text-accent border-accent/20 gap-0.5">
              <Sparkles className="h-2 w-2" /> AI Suggested
            </Badge>
          )}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSectorOpen(!sectorOpen)}
            className={`flex-1 flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 ${
              isAiDraft ? "bg-accent/5 border-accent/20" : "bg-background border-input"
            }`}
          >
            <span className={sector ? "text-foreground" : "text-muted-foreground/50"}>
              {sector || "Select sector"}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sectorOpen ? "rotate-180" : ""}`} />
          </button>
          {isAiDraft && sector && (
            <button
              type="button"
              onClick={() => setSectorOpen(true)}
              className="shrink-0 text-[10px] font-medium text-accent hover:text-accent/80 transition-colors px-2 py-1 rounded-md border border-accent/20 hover:bg-accent/5"
            >
              Change
            </button>
          )}
        </div>

        {sectorOpen && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setFocusIdx(-1); }}
                  onKeyDown={handleSectorKeyDown}
                  placeholder="Search 'SaaS', 'Construction', 'Crypto'..."
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/30"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {filteredSectors.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matching sectors</p>
              ) : (
                filteredSectors.map((s, i) => {
                  // Highlight matching subsectors in the preview
                  const q = search.toLowerCase().trim();
                  const synonymMatches = q ? findSynonymMatches(q) : [];
                  const highlightedSubs = synonymMatches
                    .filter(m => m.sector === s && m.subsector)
                    .map(m => m.subsector!);
                  const previewSubs = highlightedSubs.length > 0
                    ? highlightedSubs
                    : subsectorsFor(s).slice(0, 3);

                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSectorSelect(s)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                        i === focusIdx ? "bg-accent/10 text-foreground" :
                        s === sector ? "bg-accent/5 text-foreground font-medium" :
                        "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{s}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                        {previewSubs.join(", ")}{previewSubs.length < subsectorsFor(s).length ? "..." : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* AI Alternative Suggestion */}
        {showAiAlt && (
          <button
            type="button"
            onClick={onApplyAiSector}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-accent hover:underline"
          >
            <Sparkles className="h-3 w-3" />
            AI suggests: <span className="font-medium">{aiSuggestedSector}</span>
            {aiSuggestedSubsectors?.length ? ` → ${aiSuggestedSubsectors[0]}` : ""}
          </button>
        )}
      </div>

      {/* Subsector Multi-select Combobox — supports cross-sector picks */}
      {sector && (
        <div ref={subsectorRef} className="relative">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
            Subsectors
            <span className="text-muted-foreground/50">(up to 3, any sector)</span>
            {aiSuggestedSubsectors && aiSuggestedSubsectors.length > 0 && subsectors.some(s => aiSuggestedSubsectors.includes(s)) && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-accent/10 text-accent border-accent/20 gap-0.5">
                <Sparkles className="h-2 w-2" /> AI Suggested
              </Badge>
            )}
          </label>

          {/* Pills + input area */}
          <div
            onClick={() => setSubsectorOpen(true)}
            className="w-full flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 min-h-[38px] cursor-text transition-colors focus-within:ring-2 focus-within:ring-ring/30"
          >
            {subsectors.map(sub => (
              <span
                key={sub}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getSubsectorPillStyle(sub)}`}
              >
                {sub}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeSubsector(sub); }}
                  className="rounded-full p-0.5 hover:bg-accent/20 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {/* AI suggested subsectors shown as ghost pills (case-insensitive dedup) */}
            {aiSuggestedSubsectors?.filter(s => !subsectorExists(subsectors, s)).map(sub => (
              <button
                key={`ai-${sub}`}
                type="button"
                onClick={e => { e.stopPropagation(); toggleSubsector(sub); }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent/30 px-2.5 py-0.5 text-[11px] text-accent/60 hover:bg-accent/5 transition-colors"
              >
                <Sparkles className="h-2.5 w-2.5" />
                {sub}
              </button>
            ))}
            {/* Overflow AI suggestions link */}
            {aiOverflowSubsectors && aiOverflowSubsectors.filter(s => !subsectorExists(subsectors, s) && !aiSuggestedSubsectors?.some(a => a.toLowerCase() === s.toLowerCase())).length > 0 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowOverflow(!showOverflow); }}
                className="text-[10px] text-accent/70 hover:text-accent hover:underline transition-colors"
              >
                View {aiOverflowSubsectors.filter(s => !subsectorExists(subsectors, s) && !aiSuggestedSubsectors?.some(a => a.toLowerCase() === s.toLowerCase())).length} other AI suggestion{aiOverflowSubsectors.filter(s => !subsectorExists(subsectors, s) && !aiSuggestedSubsectors?.some(a => a.toLowerCase() === s.toLowerCase())).length > 1 ? "s" : ""}
              </button>
            )}
            {subsectors.length < 3 && (
              <input
                ref={subsearchInputRef}
                value={subsectorSearch}
                onChange={e => setSubsectorSearch(e.target.value)}
                onFocus={() => setSubsectorOpen(true)}
                onKeyDown={e => { if (e.key === "Escape") setSubsectorOpen(false); }}
                placeholder={subsectors.length === 0 ? "Search subsectors (try 'SaaS', 'AI')..." : ""}
                className="flex-1 min-w-[100px] border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
            )}
          </div>

          {/* Overflow AI suggestions panel */}
          {showOverflow && aiOverflowSubsectors && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 animate-in fade-in duration-200">
              {aiOverflowSubsectors
                .filter(s => !subsectorExists(subsectors, s) && !aiSuggestedSubsectors?.some(a => a.toLowerCase() === s.toLowerCase()))
                .map(sub => (
                  <button
                    key={`overflow-${sub}`}
                    type="button"
                    disabled={subsectors.length >= 3}
                    onClick={() => toggleSubsector(sub)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {sub}
                  </button>
                ))}
            </div>
          )}

          {subsectorOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="max-h-52 overflow-y-auto p-1">
                {filteredSubsectors.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching subsectors — try searching across sectors</p>
                ) : (
                  <>
                    {/* Group: primary sector */}
                    {filteredSubsectors.filter(s => !s.isRelated).length > 0 && (
                      <>
                        {filteredSubsectors.filter(s => !s.isRelated).map(item => {
                          const selected = subsectors.includes(item.subsector);
                          const isAiSuggested = aiSuggestedSubsectors?.includes(item.subsector);
                          const disabled = !selected && subsectors.length >= 3;
                          return (
                            <button
                              key={item.subsector}
                              type="button"
                              disabled={disabled}
                              onClick={() => { toggleSubsector(item.subsector); setSubsectorSearch(""); }}
                              className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between transition-colors ${
                                disabled ? "opacity-40 cursor-not-allowed" :
                                selected ? "bg-accent/10 text-foreground font-medium" :
                                "text-foreground hover:bg-muted"
                              }`}
                            >
                              <span>{item.subsector}</span>
                              <span className="flex items-center gap-1">
                                {isAiSuggested && (
                                  <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-accent/10 text-accent border-accent/20">
                                    ✨ AI
                                  </Badge>
                                )}
                                {selected && <span className="text-accent text-[10px]">✓</span>}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                    {/* Group: cross-sector related */}
                    {filteredSubsectors.filter(s => s.isRelated).length > 0 && (
                      <>
                        <div className="px-3 py-1.5 mt-1 border-t border-border">
                          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">From other sectors</span>
                        </div>
                        {filteredSubsectors.filter(s => s.isRelated).map(item => {
                          const selected = subsectors.includes(item.subsector);
                          const disabled = !selected && subsectors.length >= 3;
                          return (
                            <button
                              key={`${item.fromSector}-${item.subsector}`}
                              type="button"
                              disabled={disabled}
                              onClick={() => { toggleSubsector(item.subsector); setSubsectorSearch(""); }}
                              className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between transition-colors ${
                                disabled ? "opacity-40 cursor-not-allowed" :
                                selected ? "bg-muted text-foreground font-medium" :
                                "text-foreground hover:bg-muted"
                              }`}
                            >
                              <div>
                                <span>{item.subsector}</span>
                                <span className="block text-[9px] text-muted-foreground">{item.fromSector}</span>
                              </div>
                              {selected && <span className="text-accent text-[10px]">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
