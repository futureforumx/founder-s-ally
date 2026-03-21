import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GeoCluster {
  name: string;
  x: number;
  y: number;
  region: string;
  keywords: string[]; // location substrings that map to this cluster
}

const GEO_CLUSTERS: GeoCluster[] = [
  { name: "Bay Area", x: 62, y: 145, region: "North America", keywords: ["san francisco", "menlo park", "palo alto", "mountain view", "sunnyvale", "redwood", "sf", "bay area", "silicon valley", "stanford", "cupertino", "santa clara", "san mateo", "oakland", "berkeley"] },
  { name: "New York", x: 285, y: 130, region: "North America", keywords: ["new york", "nyc", "manhattan", "brooklyn"] },
  { name: "Boston", x: 300, y: 115, region: "North America", keywords: ["boston", "cambridge, ma", "cambridge ma", "massachusetts"] },
  { name: "Austin", x: 175, y: 195, region: "North America", keywords: ["austin", "dallas", "houston", "texas"] },
  { name: "London", x: 395, y: 100, region: "UK / EU", keywords: ["london", "uk", "united kingdom", "england"] },
  { name: "Berlin", x: 410, y: 85, region: "UK / EU", keywords: ["berlin", "munich", "germany", "paris", "france", "amsterdam", "europe"] },
];

const REGIONS = [
  { label: "North America", type: "primary" as const },
  { label: "UK / EU", type: "secondary" as const },
  { label: "Asia / LATAM", type: "none" as const },
];

const REGION_STYLES = {
  primary: { base: "bg-accent/10 text-accent border-accent/20", active: "bg-accent text-accent-foreground border-accent ring-2 ring-accent/20" },
  secondary: { base: "bg-secondary text-foreground border-border", active: "bg-foreground text-background border-foreground ring-2 ring-foreground/20" },
  none: { base: "bg-muted/30 text-muted-foreground border-border line-through", active: "bg-destructive/10 text-destructive border-destructive/30 ring-2 ring-destructive/20 no-underline" },
};

function classifyLocation(location: string): string | null {
  const lower = location.toLowerCase();
  for (const cluster of GEO_CLUSTERS) {
    if (cluster.keywords.some((kw) => lower.includes(kw))) {
      return cluster.name;
    }
  }
  return null;
}

interface GeographicFocusProps {
  firmName?: string;
}

export function GeographicFocus({ firmName }: GeographicFocusProps) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [hoveredSpot, setHoveredSpot] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>("All Time");
  const [locations, setLocations] = useState<{ location: string; created_at: string }[]>([]);
  const TIME_OPTIONS = ["6M", "18M", "All Time"] as const;

  useEffect(() => {
    supabase
      .from("investor_database")
      .select("location, created_at")
      .not("location", "is", null)
      .then(({ data }) => {
        if (data) setLocations(data as { location: string; created_at: string }[]);
      });
  }, []);

  const spots = useMemo(() => {
    const now = new Date();
    const cutoffs: Record<string, Date | null> = {
      "6M": new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
      "18M": new Date(now.getFullYear(), now.getMonth() - 18, now.getDate()),
      "All Time": null,
    };

    // Count per cluster per time range
    const counts: Record<string, Record<string, number>> = {};
    for (const cluster of GEO_CLUSTERS) {
      counts[cluster.name] = { "6M": 0, "18M": 0, "All Time": 0 };
    }

    for (const loc of locations) {
      if (!loc.location) continue;
      const clusterName = classifyLocation(loc.location);
      if (!clusterName) continue;
      const createdAt = new Date(loc.created_at);

      counts[clusterName]["All Time"]++;
      for (const key of ["6M", "18M"] as const) {
        if (cutoffs[key] && createdAt >= cutoffs[key]!) {
          counts[clusterName][key]++;
        }
      }
    }

    // Find max for intensity classification
    const allTimeCounts = GEO_CLUSTERS.map((c) => counts[c.name]["All Time"]);
    const maxCount = Math.max(...allTimeCounts, 1);

    return GEO_CLUSTERS.filter((c) => counts[c.name]["All Time"] > 0).map((cluster) => ({
      ...cluster,
      intensity: (counts[cluster.name]["All Time"] / maxCount >= 0.5 ? "high" : "medium") as "high" | "medium",
      investments: counts[cluster.name],
    }));
  }, [locations]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 pb-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Geographic Focus
        </h4>
        <div className="inline-flex bg-secondary/60 p-0.5 rounded-md">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setTimeRange(opt)}
              className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-all cursor-pointer ${
                timeRange === opt
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Stylized SVG Map */}
      <div className="relative w-full aspect-[2/1] rounded-lg bg-secondary/30 border border-border overflow-hidden flex-1">
        <svg viewBox="0 0 500 250" className="w-full h-full" fill="none">
          {/* North America */}
          <path
            d="M40 80 L60 60 L100 55 L140 50 L160 55 L180 70 L200 65 L220 60 L250 70 L280 80 L300 90 L310 110 L300 130 L280 140 L260 150 L240 160 L220 170 L200 180 L180 200 L160 210 L140 200 L120 190 L100 180 L80 160 L60 140 L40 120 Z"
            fill="hsl(var(--accent) / 0.08)"
            stroke="hsl(var(--accent) / 0.15)"
            strokeWidth="0.5"
          />
          {/* South America */}
          <path
            d="M180 200 L200 195 L220 200 L240 210 L250 230 L240 240 L220 245 L200 240 L185 230 L175 215 Z"
            fill="hsl(var(--muted) / 0.3)"
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />
          {/* Europe */}
          <path
            d="M340 60 L360 55 L380 60 L400 65 L420 70 L430 80 L425 95 L410 105 L395 110 L380 108 L365 100 L350 90 L340 80 Z"
            fill="hsl(var(--accent) / 0.04)"
            stroke="hsl(var(--accent) / 0.1)"
            strokeWidth="0.5"
          />
          {/* Africa */}
          <path
            d="M370 120 L390 115 L410 120 L425 135 L430 155 L425 175 L415 190 L400 200 L385 195 L375 180 L365 160 L360 140 Z"
            fill="hsl(var(--muted) / 0.2)"
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />
          {/* Asia */}
          <path
            d="M420 60 L440 55 L460 60 L480 70 L490 85 L485 100 L475 115 L460 125 L445 130 L430 120 L425 105 L420 85 Z"
            fill="hsl(var(--muted) / 0.15)"
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />

          {/* Geo dots */}
          {spots.map((spot) => {
            const isHighlighted = !activeRegion || spot.region === activeRegion;
            const dimmed = activeRegion && spot.region !== activeRegion;
            const count = spot.investments[timeRange] || 0;
            return (
            <g
              key={spot.name}
              style={{ opacity: dimmed ? 0.15 : count === 0 ? 0.25 : 1, transition: "opacity 0.3s ease" }}
              onMouseEnter={() => setHoveredSpot(spot.name)}
              onMouseLeave={() => setHoveredSpot(null)}
              className="cursor-pointer"
            >
              {/* Hover hit area */}
              <circle cx={spot.x} cy={spot.y} r={20} fill="transparent" />
              {/* Outer glow */}
              <circle
                cx={spot.x}
                cy={spot.y}
                r={spot.intensity === "high" ? 12 : 8}
                fill={
                  spot.intensity === "high"
                    ? "hsl(var(--accent) / 0.15)"
                    : "hsl(var(--accent) / 0.08)"
                }
              >
                {spot.intensity === "high" && isHighlighted && (
                  <animate
                    attributeName="r"
                    values="12;16;12"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              {/* Mid ring */}
              <circle
                cx={spot.x}
                cy={spot.y}
                r={isHighlighted && spot.intensity === "high" ? 7 : spot.intensity === "high" ? 6 : 4}
                fill={
                  spot.intensity === "high"
                    ? "hsl(var(--accent) / 0.3)"
                    : "hsl(var(--accent) / 0.15)"
                }
                style={{ transition: "r 0.3s ease" }}
              />
              {/* Core dot */}
              <circle
                cx={spot.x}
                cy={spot.y}
                r={isHighlighted && spot.intensity === "high" ? 4 : spot.intensity === "high" ? 3 : 2}
                fill="hsl(var(--accent))"
                style={{ transition: "r 0.3s ease" }}
              />
              {/* Label */}
              <text
                x={spot.x}
                y={spot.y - (spot.intensity === "high" ? 16 : 12)}
                textAnchor="middle"
                fill={dimmed ? "hsl(var(--muted-foreground) / 0.3)" : "hsl(var(--foreground))"}
                fontSize={isHighlighted ? "8" : "7"}
                fontWeight="600"
                fontFamily="system-ui"
                style={{ transition: "fill 0.3s ease" }}
              >
                {spot.name}
              </text>
              {/* Tooltip */}
              {hoveredSpot === spot.name && !dimmed && (
                <foreignObject
                  x={spot.x - 65}
                  y={spot.y + (spot.intensity === "high" ? 18 : 12)}
                  width="130"
                  height="50"
                  style={{ overflow: "visible" }}
                >
                  <div className="flex flex-col items-center">
                    <div className="bg-foreground/95 backdrop-blur-md text-background rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                      <p className="text-xs font-bold leading-tight">{spot.name}</p>
                      <p className="text-[10px] font-medium opacity-80">{count} investor{count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </foreignObject>
              )}
            </g>
            );
          })}
        </svg>
      </div>

      {/* Region buttons — anchored bottom */}
      <div className="grid grid-cols-3 gap-1.5 mt-3">
        {REGIONS.map((region) => {
          const isActive = activeRegion === region.label;
          const styles = REGION_STYLES[region.type];
          return (
            <button
              key={region.label}
              onClick={() => setActiveRegion(isActive ? null : region.label)}
              className={`flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[8px] font-semibold transition-all cursor-pointer ${
                isActive ? styles.active : styles.base
              }`}
            >
              {region.type === "primary" && "●"}
              {region.type === "secondary" && "○"}
              {region.type === "none" && "✕"}
              {region.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
