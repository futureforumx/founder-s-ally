import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { Maximize2, Minimize2 } from "lucide-react";

// ── Geo coordinate → 3D sphere position ──
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

// ── Dot-matrix globe mesh ──
function DotGlobe({ radius }: { radius: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dotRadius = 0.012;
  const dotCount = useRef(0);

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
    dotCount.current = idx;
    meshRef.current.count = idx;
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [radius]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 8000]}>
      <sphereGeometry args={[dotRadius, 6, 6]} />
      <meshBasicMaterial color="#4a7ab5" transparent opacity={0.5} />
    </instancedMesh>
  );
}

// ── Glowing pin markers ──
function Pin({ position, count, name, isActive }: { position: [number, number, number]; count: number; name: string; isActive: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const scale = Math.min(0.03 + count * 0.004, 0.08);

  useFrame(({ clock }) => {
    if (ref.current) {
      const s = scale * (1 + Math.sin(clock.elapsedTime * 2) * 0.15);
      ref.current.scale.setScalar(isActive ? s : scale * 0.6);
    }
  });

  return (
    <group>
      {/* Glow ring */}
      <mesh position={position}>
        <sphereGeometry args={[scale * 2.5, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={isActive ? 0.12 : 0.04} />
      </mesh>
      {/* Core pin */}
      <mesh
        ref={ref}
        position={position}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={hovered ? "#fbbf24" : "#f59e0b"} />
      </mesh>
      {/* White center dot */}
      <mesh position={position}>
        <sphereGeometry args={[scale * 0.35, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

// ── Auto-rotate ──
function AutoRotate() {
  const { scene } = useThree();
  useFrame(() => {
    scene.rotation.y += 0.001;
  });
  return null;
}

// ── Main Globe Scene ──
function GlobeScene({ spots, timeRange }: { spots: SpotData[]; timeRange: string }) {
  const radius = 1.4;

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />

      {/* Ocean sphere */}
      <mesh>
        <sphereGeometry args={[radius - 0.01, 64, 64]} />
        <meshBasicMaterial color="#1a2e4a" />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[radius + 0.06, 64, 64]} />
        <meshBasicMaterial color="#3b6daa" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      {/* Dot matrix land */}
      <DotGlobe radius={radius} />

      {/* Investment pins */}
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
            isActive={count > 0}
          />
        );
      })}

      <AutoRotate />
      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={2.2}
        maxDistance={5}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
      />
    </>
  );
}

interface SpotData extends GeoCluster {
  intensity: "high" | "medium";
  investments: Record<string, number>;
}

interface GeographicFocusProps {
  firmName?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function GeographicFocus({ firmName, isExpanded, onToggleExpand }: GeographicFocusProps) {
  const [timeRange, setTimeRange] = useState<string>("All Time");
  const [locations, setLocations] = useState<{ location: string; created_at: string }[]>([]);

  useEffect(() => {
    supabase
      .from("investor_database")
      .select("location, created_at")
      .not("location", "is", null)
      .then(({ data }) => {
        if (data) setLocations(data as { location: string; created_at: string }[]);
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
        if (cutoffs[key] && createdAt >= cutoffs[key]!) counts[clusterName][key]++;
      }
    }

    const allTimeCounts = GEO_CLUSTERS.map((c) => counts[c.name]["All Time"]);
    const maxCount = Math.max(...allTimeCounts, 1);

    return GEO_CLUSTERS.filter((c) => counts[c.name]["All Time"] > 0).map((cluster) => ({
      ...cluster,
      intensity: (counts[cluster.name]["All Time"] / maxCount >= 0.5 ? "high" : "medium") as "high" | "medium",
      investments: counts[cluster.name],
    }));
  }, [locations]);

  // Active spots for current time range
  const activeSpots = spots.filter((s) => (s.investments[timeRange] || 0) > 0);
  const totalInvestments = activeSpots.reduce((sum, s) => sum + (s.investments[timeRange] || 0), 0);

  return (
    <div className={`rounded-xl border border-border bg-card flex flex-col transition-all duration-300 ${isExpanded ? "col-span-3 row-span-2" : "h-full"}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
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
                  timeRange === opt
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Globe */}
      <div className={`relative w-full flex-1 min-h-0 ${isExpanded ? "min-h-[400px]" : "min-h-[180px]"}`}>
        {/* Radial glow behind globe */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3/4 h-3/4 rounded-full bg-accent/5 blur-2xl" />
        </div>
        <Canvas camera={{ position: [0, 0, 3.5], fov: 40 }} style={{ background: "transparent" }}>
          <Suspense fallback={null}>
            <GlobeScene spots={spots} timeRange={timeRange} />
          </Suspense>
        </Canvas>
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border">
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
