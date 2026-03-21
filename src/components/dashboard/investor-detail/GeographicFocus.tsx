import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface GeoSpot {
  name: string;
  x: number;
  y: number;
  intensity: "high" | "medium";
  region: string;
}

const GEO_SPOTS: GeoSpot[] = [
  { name: "Bay Area", x: 62, y: 145, intensity: "high", region: "North America" },
  { name: "New York", x: 285, y: 130, intensity: "high", region: "North America" },
  { name: "Austin", x: 175, y: 195, intensity: "medium", region: "North America" },
  { name: "London", x: 395, y: 100, intensity: "medium", region: "UK / EU" },
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

export function GeographicFocus() {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-card p-5 pb-4 flex flex-col">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4">
        Geographic Focus
      </h4>

      {/* Stylized SVG Map */}
      <div className="relative w-full aspect-[2/1] rounded-lg bg-secondary/30 border border-border overflow-hidden flex-1">
        <svg viewBox="0 0 500 250" className="w-full h-full" fill="none">
          {/* Simplified world outline */}
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
          {GEO_SPOTS.map((spot) => (
            <g key={spot.name}>
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
                {spot.intensity === "high" && (
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
                r={spot.intensity === "high" ? 6 : 4}
                fill={
                  spot.intensity === "high"
                    ? "hsl(var(--accent) / 0.3)"
                    : "hsl(var(--accent) / 0.15)"
                }
              />
              {/* Core dot */}
              <circle
                cx={spot.x}
                cy={spot.y}
                r={spot.intensity === "high" ? 3 : 2}
                fill="hsl(var(--accent))"
              />
              {/* Label */}
              <text
                x={spot.x}
                y={spot.y - (spot.intensity === "high" ? 16 : 12)}
                textAnchor="middle"
                fill="hsl(var(--foreground))"
                fontSize="7"
                fontWeight="600"
                fontFamily="system-ui"
              >
                {spot.name}
              </text>
            </g>
          ))}
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
