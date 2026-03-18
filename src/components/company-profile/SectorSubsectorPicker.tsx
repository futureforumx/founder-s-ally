import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronDown, Sparkles, Search } from "lucide-react";
import { SECTOR_TAXONOMY, sectors, subsectorsFor } from "./types";
import { Badge } from "@/components/ui/badge";

// Synonym mapping for search
const SYNONYMS: Record<string, { sector: string; subsector?: string }> = {
  // Construction & Real Estate
  "construction": { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
  "contech": { sector: "Construction & Real Estate", subsector: "ConTech (Construction Tech)" },
  "proptech": { sector: "Construction & Real Estate", subsector: "PropTech" },
  "real estate": { sector: "Construction & Real Estate", subsector: "PropTech" },
  "property": { sector: "Construction & Real Estate", subsector: "PropTech" },
  "bim": { sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" },
  "digital twin": { sector: "Construction & Real Estate", subsector: "Digital Twins & BIM" },
  "building": { sector: "Construction & Real Estate" },

  // Industrial & Manufacturing
  "robotics": { sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" },
  "automation": { sector: "Industrial & Manufacturing", subsector: "Robotics & Automation" },
  "factory": { sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" },
  "industry 4.0": { sector: "Industrial & Manufacturing", subsector: "Industrial Tech (Industry 4.0)" },
  "warehouse": { sector: "Industrial & Manufacturing", subsector: "Warehousing Tech" },
  "3d printing": { sector: "Industrial & Manufacturing", subsector: "3D Printing" },
  "additive": { sector: "Industrial & Manufacturing", subsector: "3D Printing" },
  "supply chain": { sector: "Industrial & Manufacturing", subsector: "Supply Chain Tech" },
  "logistics": { sector: "Industrial & Manufacturing", subsector: "Supply Chain Tech" },
  "manufacturing": { sector: "Industrial & Manufacturing" },

  // Enterprise Software & SaaS
  "saas": { sector: "Enterprise Software & SaaS" },
  "security": { sector: "Enterprise Software & SaaS", subsector: "Cybersecurity" },
  "cybersecurity": { sector: "Enterprise Software & SaaS", subsector: "Cybersecurity" },
  "devtools": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "open source": { sector: "Enterprise Software & SaaS", subsector: "DevTools & Open Source" },
  "hr": { sector: "Enterprise Software & SaaS", subsector: "HRTech" },
  "hiring": { sector: "Enterprise Software & SaaS", subsector: "HRTech" },
  "marketing": { sector: "Enterprise Software & SaaS", subsector: "MarTech" },
  "legaltech": { sector: "Enterprise Software & SaaS", subsector: "LegalTech" },
  "legal": { sector: "Enterprise Software & SaaS", subsector: "LegalTech" },
  "crm": { sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" },
  "erp": { sector: "Enterprise Software & SaaS", subsector: "Horizontal SaaS" },

  // Artificial Intelligence
  "gpt": { sector: "Artificial Intelligence", subsector: "LLMOps & Infrastructure" },
  "llm": { sector: "Artificial Intelligence", subsector: "LLMOps & Infrastructure" },
  "chatbot": { sector: "Artificial Intelligence", subsector: "Vertical AI Agents" },
  "agent": { sector: "Artificial Intelligence", subsector: "Vertical AI Agents" },
  "copilot": { sector: "Artificial Intelligence", subsector: "Vertical AI Agents" },
  "machine learning": { sector: "Artificial Intelligence" },
  "ml": { sector: "Artificial Intelligence" },
  "neural": { sector: "Artificial Intelligence" },
  "diffusion": { sector: "Artificial Intelligence", subsector: "Generative Media" },
  "image generation": { sector: "Artificial Intelligence", subsector: "Generative Media" },
  "edge ai": { sector: "Artificial Intelligence", subsector: "Edge AI" },
  "ai safety": { sector: "Artificial Intelligence", subsector: "AI Safety & Governance" },

  // Fintech
  "bitcoin": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "crypto": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "blockchain": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "web3": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "rwa": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "tokenization": { sector: "Fintech", subsector: "Real World Asset (RWA) Tokenization" },
  "wallet": { sector: "Fintech", subsector: "Payments Infrastructure" },
  "stripe": { sector: "Fintech", subsector: "Payments Infrastructure" },
  "payment": { sector: "Fintech", subsector: "Payments Infrastructure" },
  "insurance": { sector: "Fintech", subsector: "Insurtech" },
  "compliance": { sector: "Fintech", subsector: "RegTech" },
  "kyc": { sector: "Fintech", subsector: "RegTech" },
  "aml": { sector: "Fintech", subsector: "RegTech" },
  "wealth": { sector: "Fintech", subsector: "WealthTech" },
  "embedded finance": { sector: "Fintech", subsector: "Embedded Finance" },

  // Climate & Energy
  "solar": { sector: "Climate & Energy", subsector: "Energy Storage" },
  "wind": { sector: "Climate & Energy", subsector: "Energy Storage" },
  "carbon": { sector: "Climate & Energy", subsector: "Carbon Capture" },
  "battery": { sector: "Climate & Energy", subsector: "Energy Storage" },
  "ev": { sector: "Climate & Energy", subsector: "Energy Storage" },
  "grid": { sector: "Climate & Energy", subsector: "Grid Optimization" },
  "farming": { sector: "Climate & Energy", subsector: "AgTech" },
  "agriculture": { sector: "Climate & Energy", subsector: "AgTech" },
  "water": { sector: "Climate & Energy", subsector: "Water Tech" },

  // Health & Biotech
  "telehealth": { sector: "Health & Biotech", subsector: "Digital Health" },
  "patient": { sector: "Health & Biotech", subsector: "Digital Health" },
  "ehr": { sector: "Health & Biotech", subsector: "Digital Health" },
  "drug": { sector: "Health & Biotech", subsector: "Biopharma" },
  "pharma": { sector: "Health & Biotech", subsector: "Biopharma" },
  "dna": { sector: "Health & Biotech", subsector: "Genomics" },
  "genome": { sector: "Health & Biotech", subsector: "Genomics" },
  "longevity": { sector: "Health & Biotech", subsector: "Longevity" },
  "neuro": { sector: "Health & Biotech", subsector: "Neurotech" },
  "brain": { sector: "Health & Biotech", subsector: "Neurotech" },
  "medtech": { sector: "Health & Biotech", subsector: "MedTech" },

  // Consumer & Retail
  "ecommerce": { sector: "Consumer & Retail", subsector: "E-commerce Infrastructure" },
  "d2c": { sector: "Consumer & Retail", subsector: "E-commerce Infrastructure" },
  "gaming": { sector: "Consumer & Retail", subsector: "Gaming & Interactive" },
  "esport": { sector: "Consumer & Retail", subsector: "Gaming & Interactive" },
  "education": { sector: "Consumer & Retail", subsector: "EdTech" },
  "learning": { sector: "Consumer & Retail", subsector: "EdTech" },
  "social": { sector: "Consumer & Retail", subsector: "Social Commerce" },
  "creator": { sector: "Consumer & Retail", subsector: "Social Commerce" },
  "adtech": { sector: "Consumer & Retail", subsector: "AdTech" },
  "advertising": { sector: "Consumer & Retail", subsector: "AdTech" },

  // Deep Tech & Space
  "quantum": { sector: "Deep Tech & Space", subsector: "Quantum Computing" },
  "satellite": { sector: "Deep Tech & Space", subsector: "Satcom" },
  "space": { sector: "Deep Tech & Space", subsector: "Space Infrastructure" },
  "rocket": { sector: "Deep Tech & Space", subsector: "Space Infrastructure" },
  "chip": { sector: "Deep Tech & Space", subsector: "Semiconductors" },
  "semiconductor": { sector: "Deep Tech & Space", subsector: "Semiconductors" },
  "photonics": { sector: "Deep Tech & Space", subsector: "Photonics" },

  // Defense & GovTech
  "defense": { sector: "Defense & GovTech" },
  "military": { sector: "Defense & GovTech", subsector: "National Security" },
  "drone": { sector: "Defense & GovTech", subsector: "Drones & UAVs" },
  "uav": { sector: "Defense & GovTech", subsector: "Drones & UAVs" },
  "govtech": { sector: "Defense & GovTech", subsector: "Civic Engagement" },
  "government": { sector: "Defense & GovTech", subsector: "Civic Engagement" },
  "dual-use": { sector: "Defense & GovTech", subsector: "Dual-Use Tech" },
  "public safety": { sector: "Defense & GovTech", subsector: "Public Safety" },
};

interface SectorSubsectorPickerProps {
  sector: string;
  subsectors: string[];
  onSectorChange: (sector: string) => void;
  onSubsectorsChange: (subsectors: string[]) => void;
  aiSuggestedSector?: string | null;
  aiSuggestedSubsectors?: string[];
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
  onApplyAiSector,
  isAiDraft,
  className,
}: SectorSubsectorPickerProps) {
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

  // Filter sectors based on search + synonyms
  const getFilteredSectors = useCallback(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sectors;

    // Check synonyms first
    const synonymMatch = SYNONYMS[q];
    if (synonymMatch) {
      return sectors.filter(s => s === synonymMatch.sector);
    }

    return sectors.filter(s => s.toLowerCase().includes(q) ||
      subsectorsFor(s).some(sub => sub.toLowerCase().includes(q))
    );
  }, [search]);

  // Filter subsectors based on search + synonyms
  const getFilteredSubsectors = useCallback(() => {
    if (!sector) return [];
    const all = subsectorsFor(sector);
    const q = subsectorSearch.toLowerCase().trim();
    if (!q) return all;

    // Check synonyms
    const synonymMatch = SYNONYMS[q];
    if (synonymMatch?.subsector && synonymMatch.sector === sector) {
      return all.filter(s => s === synonymMatch.subsector);
    }

    return all.filter(s => s.toLowerCase().includes(q));
  }, [sector, subsectorSearch]);

  const filteredSectors = getFilteredSectors();
  const filteredSubsectors = getFilteredSubsectors();

  const handleSectorSelect = (s: string) => {
    onSectorChange(s);
    onSubsectorsChange([]); // reset subsectors
    setSectorOpen(false);
    setSearch("");
    setFocusIdx(-1);
  };

  const toggleSubsector = (sub: string) => {
    if (subsectors.includes(sub)) {
      onSubsectorsChange(subsectors.filter(s => s !== sub));
    } else if (subsectors.length < 3) {
      onSubsectorsChange([...subsectors, sub]);
    }
  };

  const removeSubsector = (sub: string) => {
    onSubsectorsChange(subsectors.filter(s => s !== sub));
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
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-accent/10 text-accent border-accent/20">AI</Badge>
          )}
        </label>
        <button
          type="button"
          onClick={() => setSectorOpen(!sectorOpen)}
          className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 ${
            isAiDraft ? "bg-accent/5 border-accent/20" : "bg-background border-input"
          }`}
        >
          <span className={sector ? "text-foreground" : "text-muted-foreground/50"}>
            {sector || "Select sector"}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sectorOpen ? "rotate-180" : ""}`} />
        </button>

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
                  placeholder="Search sectors or type 'Bitcoin', 'AI'..."
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/30"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {filteredSectors.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matching sectors</p>
              ) : (
                filteredSectors.map((s, i) => (
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
                      {subsectorsFor(s).slice(0, 3).join(", ")}...
                    </span>
                  </button>
                ))
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

      {/* Subsector Multi-select Combobox */}
      {sector && (
        <div ref={subsectorRef} className="relative">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1.5">
            Subsectors
            <span className="text-muted-foreground/50">(up to 3)</span>
          </label>

          {/* Pills + input area */}
          <div
            onClick={() => setSubsectorOpen(true)}
            className="w-full flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 min-h-[38px] cursor-text transition-colors focus-within:ring-2 focus-within:ring-ring/30"
          >
            {subsectors.map(sub => (
              <span
                key={sub}
                className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-accent"
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
            {/* AI suggested subsectors shown as ghost pills */}
            {aiSuggestedSubsectors?.filter(s => !subsectors.includes(s)).map(sub => (
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
            {subsectors.length < 3 && (
              <input
                ref={subsearchInputRef}
                value={subsectorSearch}
                onChange={e => setSubsectorSearch(e.target.value)}
                onFocus={() => setSubsectorOpen(true)}
                onKeyDown={e => { if (e.key === "Escape") setSubsectorOpen(false); }}
                placeholder={subsectors.length === 0 ? "Search subsectors..." : ""}
                className="flex-1 min-w-[100px] border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
            )}
          </div>

          {subsectorOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="max-h-44 overflow-y-auto p-1">
                {filteredSubsectors.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching subsectors</p>
                ) : (
                  filteredSubsectors.map(sub => {
                    const selected = subsectors.includes(sub);
                    const isAiSuggested = aiSuggestedSubsectors?.includes(sub);
                    const disabled = !selected && subsectors.length >= 3;
                    return (
                      <button
                        key={sub}
                        type="button"
                        disabled={disabled}
                        onClick={() => { toggleSubsector(sub); setSubsectorSearch(""); }}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between transition-colors ${
                          disabled ? "opacity-40 cursor-not-allowed" :
                          selected ? "bg-accent/10 text-foreground font-medium" :
                          "text-foreground hover:bg-muted"
                        }`}
                      >
                        <span>{sub}</span>
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
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
