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

interface PinProps {
  position: [number, number, number];
  count: number;
  name: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  investorNames: string[];
}

function Pin({ position, count, name, isActive, isSelected, onSelect, investorNames }: PinProps) {
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
      {/* Tooltip */}
      {isSelected && (
        <Html position={position} distanceFactor={4} center style={{ pointerEvents: "auto" }}>
          <div
            className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700/60 rounded-lg px-3 py-2.5 shadow-2xl min-w-[160px] max-w-[220px]"
            style={{ transform: "translateY(-120%)" }}
          >
            <p className="text-[11px] font-bold text-white leading-tight">{name}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{count} investor{count !== 1 ? "s" : ""}</p>
            {investorNames.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-zinc-700/50 space-y-0.5 max-h-[80px] overflow-y-auto">
                {investorNames.slice(0, 6).map((n) => (
                  <p key={n} className="text-[9px] text-zinc-300 truncate">• {n}</p>
                ))}
                {investorNames.length > 6 && (
                  <p className="text-[9px] text-zinc-500">+{investorNames.length - 6} more</p>
                )}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function AutoRotate({ paused }: { paused: boolean }) {
  const { scene } = useThree();
  useFrame(() => {
    if (!paused) scene.rotation.y += 0.001;
  });
  return null;
}

interface SpotData extends GeoCluster {
  intensity: "high" | "medium";
  investments: Record<string, number>;
  investorNames: Record<string, string[]>;
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
      <mesh>
        <sphereGeometry args={[radius - 0.01, 64, 64]} />
        <meshBasicMaterial color="#1a2e4a" />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius + 0.06, 64, 64]} />
        <meshBasicMaterial color="#3b6daa" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
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
            investorNames={spot.investorNames[timeRange] || []}
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

export function GeographicFocus({ firmName, isExpanded, onToggleExpand }: GeographicFocusProps) {
  const [timeRange, setTimeRange] = useState<string>("All Time");
  const [locations, setLocations] = useState<{ location: string; created_at: string; firm_name: string }[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("investor_database")
      .select("location, created_at, firm_name")
      .not("location", "is", null)
      .then(({ data }) => {
        if (data) setLocations(data as { location: string; created_at: string; firm_name: string }[]);
      });
  }, []);

  const spots: SpotData[] = useMemo(() => {
    const now = new Date();
    const cutoffs: Record<string, Date | null> = {
      "6M": new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
      "18M": new Date(now.getFullYear(), now.getMonth() - 18, now.getDate()),
      "All Time": null,
    };

    const counts: Record<string, Record<string, number>> = {};
    const names: Record<string, Record<string, string[]>> = {};
    for (const cluster of GEO_CLUSTERS) {
      counts[cluster.name] = { "6M": 0, "18M": 0, "All Time": 0 };
      names[cluster.name] = { "6M": [], "18M": [], "All Time": [] };
    }

    for (const loc of locations) {
      if (!loc.location) continue;
      const clusterName = classifyLocation(loc.location);
      if (!clusterName) continue;
      const createdAt = new Date(loc.created_at);
      counts[clusterName]["All Time"]++;
      names[clusterName]["All Time"].push(loc.firm_name);
      for (const key of ["6M", "18M"] as const) {
        if (cutoffs[key] && createdAt >= cutoffs[key]!) {
          counts[clusterName][key]++;
          names[clusterName][key].push(loc.firm_name);
        }
      }
    }

    const allTimeCounts = GEO_CLUSTERS.map((c) => counts[c.name]["All Time"]);
    const maxCount = Math.max(...allTimeCounts, 1);

    return GEO_CLUSTERS.filter((c) => counts[c.name]["All Time"] > 0).map((cluster) => ({
      ...cluster,
      intensity: (counts[cluster.name]["All Time"] / maxCount >= 0.5 ? "high" : "medium") as "high" | "medium",
      investments: counts[cluster.name],
      investorNames: names[cluster.name],
    }));
  }, [locations]);

  const activeSpots = spots.filter((s) => (s.investments[timeRange] || 0) > 0);
  const totalInvestments = activeSpots.reduce((sum, s) => sum + (s.investments[timeRange] || 0), 0);

  return (
    <div className={`rounded-xl border border-border bg-card flex flex-col transition-all duration-300 overflow-hidden ${isExpanded ? "" : "h-full"}`}
      style={isExpanded ? { height: "calc(100vh - 280px)", maxHeight: "520px" } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Geographic Focus
        </h4>
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

      {/* Globe — fills remaining space */}
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

      {/* Stats footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">{activeSpots.length}</span> regions
          </span>
          <span className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">{totalInvestments}</span> investors
          </span>
        </div>
        <div className="flex items-center gap-1">
          {activeSpots.slice(0, 3).map((s) => (
            <span key={s.name} className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-medium">
              {s.name}
            </span>
          ))}
          {activeSpots.length > 3 && (
            <span className="text-[9px] text-muted-foreground">+{activeSpots.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
}
