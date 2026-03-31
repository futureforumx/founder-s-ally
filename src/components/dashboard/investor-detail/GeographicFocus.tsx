import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { Maximize2, Minimize2 } from "lucide-react";

function latLonToXYZ(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

interface GeoCluster {
  name: string;
  lat: number;
  lon: number;
  region: string;
  keywords: string[];
}

const GEO_CLUSTERS: GeoCluster[] = [
  { name: "Bay Area", lat: 37.77, lon: -122.42, region: "North America", keywords: ["san francisco", "menlo park", "palo alto", "mountain view", "sunnyvale", "redwood", "sf", "bay area", "silicon valley", "stanford", "cupertino", "santa clara", "san mateo", "oakland", "berkeley"] },
  { name: "New York", lat: 40.71, lon: -74.01, region: "North America", keywords: ["new york", "nyc", "manhattan", "brooklyn"] },
  { name: "Boston", lat: 42.36, lon: -71.06, region: "North America", keywords: ["boston", "cambridge, ma", "cambridge ma", "massachusetts"] },
  { name: "Austin", lat: 30.27, lon: -97.74, region: "North America", keywords: ["austin", "dallas", "houston", "texas"] },
  { name: "London", lat: 51.51, lon: -0.13, region: "UK / EU", keywords: ["london", "uk", "united kingdom", "england"] },
  { name: "Berlin", lat: 52.52, lon: 13.41, region: "UK / EU", keywords: ["berlin", "munich", "germany", "paris", "france", "amsterdam", "europe"] },
  { name: "Singapore", lat: 1.35, lon: 103.82, region: "Asia / LATAM", keywords: ["singapore", "southeast asia"] },
  { name: "São Paulo", lat: -23.55, lon: -46.63, region: "Asia / LATAM", keywords: ["sao paulo", "são paulo", "brazil", "latin america", "latam"] },
  { name: "Tokyo", lat: 35.68, lon: 139.69, region: "Asia / LATAM", keywords: ["tokyo", "japan"] },
  { name: "Mumbai", lat: 19.08, lon: 72.88, region: "Asia / LATAM", keywords: ["mumbai", "india", "bangalore", "bengaluru"] },
  { name: "Tel Aviv", lat: 32.09, lon: 34.78, region: "UK / EU", keywords: ["tel aviv", "israel"] },
  { name: "Shanghai", lat: 31.23, lon: 121.47, region: "Asia / LATAM", keywords: ["shanghai", "beijing", "china", "shenzhen"] },
];

function classifyLocation(location: string): string | null {
  const lower = location.toLowerCase();
  for (const cluster of GEO_CLUSTERS) {
    if (cluster.keywords.some((kw) => lower.includes(kw))) return cluster.name;
  }
  return null;
}

const TIME_OPTIONS = ["6M", "18M", "All Time"] as const;

// ── Dot globe ──
function DotGlobe({ radius }: { radius: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    let idx = 0;
    const step = 3.5;
    for (let lat = -85; lat <= 85; lat += step) {
      const latRad = lat * (Math.PI / 180);
      const lonStep = step / Math.cos(latRad);
      for (let lon = -180; lon < 180; lon += Math.max(lonStep, step)) {
        if (idx >= 8000) break;
        const [x, y, z] = latLonToXYZ(lat, lon, radius);
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    meshRef.current.count = idx;
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [radius]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 8000]}>
      <sphereGeometry args={[0.012, 6, 6]} />
      <meshBasicMaterial color="#4a7ab5" transparent opacity={0.5} />
    </instancedMesh>
  );
}

// ── Portfolio company in tooltip ──
interface PortfolioDeal {
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
  logo_url: string; // derived from company name
}

// ── Pin with tooltip ──
interface PinProps {
  position: [number, number, number];
  count: number;
  name: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  deals: PortfolioDeal[];
}

function Pin({ position, count, name, isActive, isSelected, onSelect, deals }: PinProps) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const scale = Math.min(0.03 + count * 0.004, 0.08);

  useFrame(({ clock }) => {
    if (ref.current) {
      const s = scale * (1 + Math.sin(clock.elapsedTime * 2) * 0.15);
      ref.current.scale.setScalar(isActive ? s : scale * 0.6);
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  const top3 = deals.slice(0, 3);

  return (
    <group>
      <mesh position={position}>
        <sphereGeometry args={[scale * 2.5, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={isActive ? 0.12 : 0.04} />
      </mesh>
      <mesh
        ref={ref}
        position={position}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={hovered || isSelected ? "#fbbf24" : "#f59e0b"} />
      </mesh>
      <mesh position={position}>
        <sphereGeometry args={[scale * 0.35, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {isSelected && (
        <Html position={position} distanceFactor={4} center style={{ pointerEvents: "auto" }}>
          <div
            className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-xl px-3.5 py-3 shadow-2xl min-w-[200px] max-w-[240px]"
            style={{ transform: "translateY(-120%)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold text-white leading-tight">{name}</p>
              <span className="text-[9px] text-zinc-500 font-medium">{count} firm{count !== 1 ? "s" : ""}</span>
            </div>

            {/* Portfolio companies */}
            {top3.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-700/50 space-y-2">
                <p className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">Recent Investments</p>
                {top3.map((deal, i) => (
                  <div key={`${deal.company_name}-${i}`} className="flex items-center gap-2">
                    <img
                      src={deal.logo_url}
                      alt=""
                      className="w-5 h-5 rounded bg-zinc-800 object-contain shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-white font-semibold truncate leading-tight">{deal.company_name}</p>
                      <p className="text-[9px] text-zinc-400 truncate">
                        {[deal.amount, deal.stage].filter(Boolean).join(" · ") || "Undisclosed"}
                      </p>
                    </div>
                  </div>
                ))}
                {deals.length > 3 && (
                  <p className="text-[9px] text-zinc-500 pt-0.5">+{deals.length - 3} more</p>
                )}
              </div>
            )}

            {top3.length === 0 && (
              <p className="text-[9px] text-zinc-500 mt-1">No recent deal data available</p>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function AutoRotate({ paused }: { paused: boolean }) {
  const { scene } = useThree();
  useFrame(() => { if (!paused) scene.rotation.y += 0.001; });
  return null;
}

interface SpotData extends GeoCluster {
  intensity: "high" | "medium";
  investments: Record<string, number>;
  deals: Record<string, PortfolioDeal[]>;
}

function GlobeScene({ spots, timeRange, selectedPin, onSelectPin }: {
  spots: SpotData[];
  timeRange: string;
  selectedPin: string | null;
  onSelectPin: (name: string | null) => void;
}) {
  const radius = 1.4;
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <mesh><sphereGeometry args={[radius - 0.01, 64, 64]} /><meshBasicMaterial color="#1a2e4a" /></mesh>
      <mesh><sphereGeometry args={[radius + 0.06, 64, 64]} /><meshBasicMaterial color="#3b6daa" transparent opacity={0.08} side={THREE.BackSide} /></mesh>
      <DotGlobe radius={radius} />
      {spots.map((spot) => {
        const count = spot.investments[timeRange] || 0;
        if (count === 0) return null;
        const pos = latLonToXYZ(spot.lat, spot.lon, radius + 0.02);
        return (
          <Pin
            key={spot.name}
            position={pos}
            count={count}
            name={spot.name}
            isActive
            isSelected={selectedPin === spot.name}
            onSelect={() => onSelectPin(selectedPin === spot.name ? null : spot.name)}
            deals={spot.deals[timeRange] || []}
          />
        );
      })}
      <AutoRotate paused={!!selectedPin} />
      <OrbitControls enableZoom enablePan={false} minDistance={2.2} maxDistance={5} rotateSpeed={0.5} zoomSpeed={0.6} />
    </>
  );
}

interface GeographicFocusProps {
  firmName?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface FirmLocationRow {
  id: string;
  location: string;
  created_at: string;
  firm_name: string;
  website_url: string | null;
}

interface DealRow {
  firm_id: string;
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
  created_at: string;
}

function companyLogoUrl(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${slug}.com&size=128`;
}

export function GeographicFocus({ firmName, isExpanded, onToggleExpand }: GeographicFocusProps) {
  const [timeRange, setTimeRange] = useState<string>("All Time");
  const [firmLocations, setFirmLocations] = useState<FirmLocationRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);

  useEffect(() => {
    // Fetch firms with locations and deals in parallel
    Promise.all([
      supabase
        .from("firm_records")
        .select("id, location, created_at, firm_name, website_url")
        .not("location", "is", null),
      supabase
        .from("firm_recent_deals")
        .select("firm_id, company_name, amount, stage, date_announced, created_at")
        .order("created_at", { ascending: false }),
    ]).then(([locRes, dealRes]) => {
      if (locRes.data) setFirmLocations(locRes.data as FirmLocationRow[]);
      if (dealRes.data) setDeals(dealRes.data as DealRow[]);
    });
  }, []);

  const spots: SpotData[] = useMemo(() => {
    const now = new Date();
    const cutoffs: Record<string, Date | null> = {
      "6M": new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
      "18M": new Date(now.getFullYear(), now.getMonth() - 18, now.getDate()),
      "All Time": null,
    };

    // Build firmId → cluster mapping
    const firmCluster = new Map<string, string>();
    const counts: Record<string, Record<string, number>> = {};
    const clusterFirmIds: Record<string, Record<string, Set<string>>> = {};

    for (const cluster of GEO_CLUSTERS) {
      counts[cluster.name] = { "6M": 0, "18M": 0, "All Time": 0 };
      clusterFirmIds[cluster.name] = { "6M": new Set(), "18M": new Set(), "All Time": new Set() };
    }

    for (const firm of firmLocations) {
      if (!firm.location) continue;
      const clusterName = classifyLocation(firm.location);
      if (!clusterName) continue;
      firmCluster.set(firm.id, clusterName);
      const createdAt = new Date(firm.created_at);
      counts[clusterName]["All Time"]++;
      clusterFirmIds[clusterName]["All Time"].add(firm.id);
      for (const key of ["6M", "18M"] as const) {
        if (cutoffs[key] && createdAt >= cutoffs[key]!) {
          counts[clusterName][key]++;
          clusterFirmIds[clusterName][key].add(firm.id);
        }
      }
    }

    // Build deals per cluster per time range, sorted by recency
    const clusterDeals: Record<string, Record<string, PortfolioDeal[]>> = {};
    for (const cluster of GEO_CLUSTERS) {
      clusterDeals[cluster.name] = { "6M": [], "18M": [], "All Time": [] };
    }

    // Group deals by firm, then assign to clusters
    for (const deal of deals) {
      const clusterName = firmCluster.get(deal.firm_id);
      if (!clusterName) continue;
      const pd: PortfolioDeal = {
        company_name: deal.company_name,
        amount: deal.amount,
        stage: deal.stage,
        date_announced: deal.date_announced,
        logo_url: companyLogoUrl(deal.company_name),
      };

      for (const key of ["6M", "18M", "All Time"] as const) {
        if (clusterFirmIds[clusterName]?.[key]?.has(deal.firm_id)) {
          clusterDeals[clusterName][key].push(pd);
        }
      }
    }

    // Deduplicate deals per cluster (same company name)
    for (const cluster of GEO_CLUSTERS) {
      for (const key of ["6M", "18M", "All Time"] as const) {
        const seen = new Set<string>();
        clusterDeals[cluster.name][key] = clusterDeals[cluster.name][key].filter((d) => {
          if (seen.has(d.company_name)) return false;
          seen.add(d.company_name);
          return true;
        });
      }
    }

    const allTimeCounts = GEO_CLUSTERS.map((c) => counts[c.name]["All Time"]);
    const maxCount = Math.max(...allTimeCounts, 1);

    return GEO_CLUSTERS.filter((c) => counts[c.name]["All Time"] > 0).map((cluster) => ({
      ...cluster,
      intensity: (counts[cluster.name]["All Time"] / maxCount >= 0.5 ? "high" : "medium") as "high" | "medium",
      investments: counts[cluster.name],
      deals: clusterDeals[cluster.name],
    }));
  }, [firmLocations, deals]);

  const activeSpots = spots.filter((s) => (s.investments[timeRange] || 0) > 0);
  const totalInvestments = activeSpots.reduce((sum, s) => sum + (s.investments[timeRange] || 0), 0);

  return (
    <div
      className={`rounded-xl border border-border bg-card flex flex-col transition-all duration-300 overflow-hidden ${isExpanded ? "" : "h-full"}`}
      style={isExpanded ? { height: "calc(100vh - 280px)", maxHeight: "520px" } : undefined}
    >
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Geographic Focus</h4>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-secondary/60 p-0.5 rounded-md">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setTimeRange(opt)}
                className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-all cursor-pointer ${
                  timeRange === opt ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {onToggleExpand && (
            <button onClick={onToggleExpand} className="p-1 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3/4 h-3/4 rounded-full bg-accent/5 blur-2xl" />
        </div>
        <Canvas camera={{ position: [0, 0, 3.5], fov: 40 }} style={{ background: "transparent", width: "100%", height: "100%" }}>
          <Suspense fallback={null}>
            <GlobeScene spots={spots} timeRange={timeRange} selectedPin={selectedPin} onSelectPin={setSelectedPin} />
          </Suspense>
        </Canvas>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Focus</span>
          {activeSpots
            .sort((a, b) => (b.investments[timeRange] || 0) - (a.investments[timeRange] || 0))
            .slice(0, 3)
            .map((s) => {
              const pct = totalInvestments > 0 ? Math.round(((s.investments[timeRange] || 0) / totalInvestments) * 100) : 0;
              return (
                <span key={s.name} className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-medium">
                  {s.name} <span className="text-accent/60">{pct}%</span>
                </span>
              );
            })}
          {activeSpots.length > 3 && <span className="text-[9px] text-muted-foreground">+{activeSpots.length - 3}</span>}
        </div>
      </div>
    </div>
  );
}
