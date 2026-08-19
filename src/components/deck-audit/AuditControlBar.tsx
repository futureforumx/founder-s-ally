import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTOR_OPTIONS, GEO_OPTIONS } from "@/constants/taxonomy";

interface AuditControlBarProps {
  initialProfile?: string;
  initialBenchmark?: string;
  initialGeo?: string;
}

const investorProfiles = ["Accelerator", "Pre-Seed", "Seed", "Series A", "Growth Equity"];
const businessModels = ["B2B (SMB)", "B2B (Enterprise)", "Marketplace", "Consumer", "E-Commerce"];
// Same taxonomy used to store a company's sector everywhere else in the app, alphabetized for this dropdown.
const sectorOptions = SECTOR_OPTIONS.map((o) => o.label).sort((a, b) => a.localeCompare(b));
// Same canonical regions the backfill pipeline uses to populate investor geo_focus in the database.
const geoOptions = GEO_OPTIONS.map((o) => o.label);

function sectorLabel(sectors: string[]): string {
  if (sectors.length === 0) return "Select sector";
  if (sectors.length === 1) return sectors[0];
  return `${sectors[0]} +${sectors.length - 1}`;
}

export function AuditControlBar({ initialProfile, initialBenchmark, initialGeo }: AuditControlBarProps) {
  const [profile, setProfile] = useState(initialProfile && investorProfiles.includes(initialProfile) ? initialProfile : "Seed");
  const [businessModel, setBusinessModel] = useState(businessModels[0]);
  const [sectors, setSectors] = useState<string[]>(
    initialBenchmark && sectorOptions.includes(initialBenchmark) ? [initialBenchmark] : [sectorOptions[0]]
  );
  const [geo, setGeo] = useState(initialGeo && geoOptions.includes(initialGeo) ? initialGeo : geoOptions[0]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [businessModelOpen, setBusinessModelOpen] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [geoOpen, setGeoOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const businessModelRef = useRef<HTMLDivElement>(null);
  const sectorRef = useRef<HTMLDivElement>(null);
  const geoRef = useRef<HTMLDivElement>(null);

  const toggleSector = (s: string) => {
    setSectors((prev) => {
      if (prev.includes(s)) {
        // Keep at least one sector selected.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  };

  const closeAllExcept = (keep: "profile" | "businessModel" | "sector" | "geo") => {
    if (keep !== "profile") setProfileOpen(false);
    if (keep !== "businessModel") setBusinessModelOpen(false);
    if (keep !== "sector") setSectorOpen(false);
    if (keep !== "geo") setGeoOpen(false);
  };

  useEffect(() => {
    if (!profileOpen && !businessModelOpen && !sectorOpen && !geoOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (businessModelRef.current && !businessModelRef.current.contains(target)) setBusinessModelOpen(false);
      if (sectorRef.current && !sectorRef.current.contains(target)) setSectorOpen(false);
      if (geoRef.current && !geoRef.current.contains(target)) setGeoOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setBusinessModelOpen(false);
        setSectorOpen(false);
        setGeoOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen, businessModelOpen, sectorOpen, geoOpen]);

  const controlButtonClass =
    "flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-accent/40 transition-colors";

  return (
    <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border py-3">
      <div className="flex w-full min-w-0 items-center gap-2 flex-nowrap">
        {/* Stage */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Stage</span>
          <div className="relative shrink-0" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); closeAllExcept("profile"); }}
              className={cn(controlButtonClass, "whitespace-nowrap")}
            >
              {profile}
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", profileOpen && "rotate-180")} />
            </button>

            {profileOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-xl border border-border bg-card shadow-lg p-1 z-40">
                {investorProfiles.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setProfile(p); setProfileOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      p === profile ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {p}
                    {p === profile && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* Business Model */}
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <span className="hidden shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground sm:inline">Model</span>
          <div className="relative min-w-0" ref={businessModelRef}>
            <button
              onClick={() => { setBusinessModelOpen(!businessModelOpen); closeAllExcept("businessModel"); }}
              className={cn(controlButtonClass, "max-w-[9.5rem]")}
              title={businessModel}
            >
              <span className="truncate">{businessModel}</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", businessModelOpen && "rotate-180")} />
            </button>

            {businessModelOpen && (
              <div className="absolute top-full left-0 mt-1 w-40 rounded-xl border border-border bg-card shadow-lg p-1 z-40">
                {businessModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setBusinessModel(m); setBusinessModelOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      m === businessModel ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {m}
                    {m === businessModel && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* Sector (multi-select) */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sector</span>
          <div className="relative min-w-0 flex-1" ref={sectorRef}>
            <button
              onClick={() => { setSectorOpen(!sectorOpen); closeAllExcept("sector"); }}
              className={cn(controlButtonClass, "w-full")}
              title={sectors.join(", ")}
            >
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{sectorLabel(sectors)}</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", sectorOpen && "rotate-180")} />
            </button>

            {sectorOpen && (
              <div className="absolute top-full left-0 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-1 z-40">
                {sectorOptions.map((s) => {
                  const selected = sectors.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSector(s)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                        selected ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                          selected ? "border-accent bg-accent" : "border-border"
                        )}
                      >
                        {selected && <Check className="h-2.5 w-2.5 text-accent-foreground" />}
                      </span>
                      <span className="truncate">{s}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* Geo */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Geo</span>
          <div className="relative shrink-0" ref={geoRef}>
            <button
              onClick={() => { setGeoOpen(!geoOpen); closeAllExcept("geo"); }}
              className={cn(controlButtonClass, "max-w-[7.5rem]")}
              title={geo}
            >
              <span className="truncate">{geo}</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", geoOpen && "rotate-180")} />
            </button>

            {geoOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-xl border border-border bg-card shadow-lg p-1 z-40">
                {geoOptions.map((g) => (
                  <button
                    key={g}
                    onClick={() => { setGeo(g); setGeoOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      g === geo ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {g}
                    {g === geo && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
