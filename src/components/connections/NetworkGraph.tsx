import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// ── Types ──
type ConnectionType = "founder" | "co-investor" | "portfolio" | "lp";
type Strength = "strong" | "medium" | "weak";

interface GraphNode {
  id: string;
  label: string;
  type: "you" | "contact" | "investor" | "firm";
  connectionType?: ConnectionType;
  x: number;
  y: number;
  subtitle?: string;
  initials?: string;
  avatarUrl?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  strength: Strength;
  connectionType: ConnectionType;
  label?: string;
  tooltip?: string;
  lastActivity?: string;
  sharedContext?: string;
}

// ── Color system ──
const TYPE_COLORS: Record<ConnectionType, string> = {
  founder: "#3B82F6",
  "co-investor": "#5B5CFF",
  portfolio: "#10B981",
  lp: "#F59E0B",
};

const TYPE_LABELS: Record<ConnectionType, string> = {
  founder: "Founder",
  "co-investor": "Co-investor",
  portfolio: "Portfolio",
  lp: "LP",
};

const STRENGTH_CONFIG: Record<Strength, { width: number; opacity: number; dash?: string; glow: boolean; particles: number; particleSize: number; speed: number }> = {
  strong: { width: 3, opacity: 0.9, glow: true, particles: 3, particleSize: 4, speed: 2.5 },
  medium: { width: 1.5, opacity: 0.6, glow: false, particles: 1, particleSize: 3, speed: 4 },
  weak: { width: 1, opacity: 0.3, dash: "4 6", glow: false, particles: 0, particleSize: 0, speed: 0 },
};

// ── Seed data — VC network ──
const BASE_NODES: GraphNode[] = [
  { id: "you", label: "FUTURE FORUM", type: "you", x: 0.5, y: 0.5, initials: "FF", avatarUrl: "" },
  // Portfolio founders (blue, strong)
  { id: "f1", label: "Sarah Chen", type: "contact", connectionType: "founder", x: 0.22, y: 0.25, subtitle: "CEO, NovaBio", initials: "SC", avatarUrl: "https://i.pravatar.cc/96?u=sarah-chen" },
  { id: "f2", label: "James Park", type: "contact", connectionType: "founder", x: 0.78, y: 0.2, subtitle: "CTO, DataLens AI", initials: "JP", avatarUrl: "https://i.pravatar.cc/96?u=james-park" },
  { id: "f3", label: "Priya Sharma", type: "contact", connectionType: "founder", x: 0.35, y: 0.12, subtitle: "Founder, ClimateOS", initials: "PS", avatarUrl: "https://i.pravatar.cc/96?u=priya-sharma-v" },
  // Co-investor VCs (purple, medium)
  { id: "ci1", label: "Sequoia Capital", type: "firm", connectionType: "co-investor", x: 0.88, y: 0.45, subtitle: "VC Fund", initials: "SQ", avatarUrl: "https://www.google.com/s2/favicons?domain=sequoiacap.com&sz=128" },
  { id: "ci2", label: "a16z", type: "firm", connectionType: "co-investor", x: 0.12, y: 0.52, subtitle: "VC Fund", initials: "A1", avatarUrl: "https://www.google.com/s2/favicons?domain=a16z.com&sz=128" },
  // Portfolio companies (green, strong)
  { id: "pc1", label: "NovaBio", type: "firm", connectionType: "portfolio", x: 0.18, y: 0.75, subtitle: "Series A · 2023", initials: "NB", avatarUrl: "https://www.google.com/s2/favicons?domain=novabio.com&sz=128" },
  { id: "pc2", label: "DataLens AI", type: "firm", connectionType: "portfolio", x: 0.82, y: 0.72, subtitle: "Seed · 2024", initials: "DL", avatarUrl: "https://www.google.com/s2/favicons?domain=datalens.ai&sz=128" },
  // LPs (amber, medium)
  { id: "lp1", label: "Mike Zhang", type: "investor", connectionType: "lp", x: 0.55, y: 0.88, subtitle: "Family Office", initials: "MZ", avatarUrl: "https://i.pravatar.cc/96?u=mike-zhang" },
  { id: "lp2", label: "Lisa Patel", type: "investor", connectionType: "lp", x: 0.4, y: 0.85, subtitle: "Endowment", initials: "LP", avatarUrl: "https://i.pravatar.cc/96?u=lisa-patel-lp" },
  // Prospective founders (blue, weak)
  { id: "pf1", label: "Tom Reid", type: "contact", connectionType: "founder", x: 0.08, y: 0.3, subtitle: "Stealth · Pre-seed", initials: "TR", avatarUrl: "https://i.pravatar.cc/96?u=tom-reid-p" },
  { id: "pf2", label: "Ana Costa", type: "contact", connectionType: "founder", x: 0.92, y: 0.15, subtitle: "Stealth · Ideation", initials: "AC", avatarUrl: "https://i.pravatar.cc/96?u=ana-costa" },
];

const EDGES: GraphEdge[] = [
  // Strong founder connections
  { from: "you", to: "f1", strength: "strong", connectionType: "founder", label: "Portfolio founder", tooltip: "Led Seed round · $2M check", lastActivity: "Active 2 days ago", sharedContext: "Board seat · NovaBio" },
  { from: "you", to: "f2", strength: "strong", connectionType: "founder", label: "Portfolio founder", tooltip: "Co-led Series A · $5M", lastActivity: "Active 1 week ago", sharedContext: "Board observer · DataLens AI" },
  { from: "you", to: "f3", strength: "strong", connectionType: "founder", label: "Portfolio founder", tooltip: "Led Pre-seed · $1.5M", lastActivity: "Active 3 days ago", sharedContext: "Board seat · ClimateOS" },
  // Medium co-investor connections
  { from: "you", to: "ci1", strength: "medium", connectionType: "co-investor", label: "Co-investor · 3 shared deals", tooltip: "Co-invested in Series A · $3M check", lastActivity: "Active 3 weeks ago", sharedContext: "Co-invested in: NovaBio, DataLens" },
  { from: "you", to: "ci2", strength: "medium", connectionType: "co-investor", label: "Co-investor · 2 shared deals", tooltip: "Syndicate partner", lastActivity: "Active 1 month ago", sharedContext: "Co-invested in: ClimateOS" },
  // Strong portfolio company connections
  { from: "you", to: "pc1", strength: "strong", connectionType: "portfolio", label: "Portfolio · 2023 vintage", tooltip: "Portfolio company · 2023 vintage", lastActivity: "Active today", sharedContext: "12x paper return" },
  { from: "you", to: "pc2", strength: "strong", connectionType: "portfolio", label: "Portfolio · 2024 vintage", tooltip: "Portfolio company · Seed stage", lastActivity: "Active yesterday", sharedContext: "Post-revenue" },
  // Medium LP connections
  { from: "you", to: "lp1", strength: "medium", connectionType: "lp", label: "LP · $5M committed", tooltip: "LP · Fund II", lastActivity: "Active 2 months ago", sharedContext: "Fund II · $5M commitment" },
  { from: "you", to: "lp2", strength: "medium", connectionType: "lp", label: "LP · $10M committed", tooltip: "LP · Fund I & II", lastActivity: "Active 6 weeks ago", sharedContext: "Fund I & II · $10M total" },
  // Weak prospective connections
  { from: "you", to: "pf1", strength: "weak", connectionType: "founder", label: "2nd degree · via Sarah Chen", tooltip: "Met at TechCrunch Disrupt", lastActivity: "Dormant · 4 months ago", sharedContext: "Intro requested" },
  { from: "you", to: "pf2", strength: "weak", connectionType: "founder", label: "2nd degree · via James Park", tooltip: "Cold inbound", lastActivity: "Dormant · 6 months ago", sharedContext: "Application received" },
  // Cross connections
  { from: "f1", to: "pc1", strength: "strong", connectionType: "portfolio", label: "CEO", tooltip: "Founder-company link", lastActivity: "Active", sharedContext: "CEO of NovaBio" },
  { from: "f2", to: "pc2", strength: "strong", connectionType: "portfolio", label: "CTO", tooltip: "Founder-company link", lastActivity: "Active", sharedContext: "CTO of DataLens AI" },
];

/** Cubic bezier curve with perpendicular offset scaled by strength */
function curvePath(x1: number, y1: number, x2: number, y2: number, strength: Strength, edgeIndex: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return `M${x1},${y1} L${x2},${y2}`;
  const px = -dy / len;
  const py = dx / len;
  // Stronger = tighter curve, weaker = more pronounced bow
  const baseOffset = strength === "strong" ? 40 : strength === "medium" ? 60 : 80;
  const sign = edgeIndex % 2 === 0 ? 1 : -1;
  const offset = sign * Math.min(baseOffset, len * 0.3);
  const cx = mx + px * offset;
  const cy = my + py * offset;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

export function NetworkGraph() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 420 });
  const [mounted, setMounted] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-avatar", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const NODES = useMemo(() => {
    const userAvatar = profile?.avatar_url || user?.user_metadata?.avatar_url || "";
    const userName = profile?.full_name || user?.user_metadata?.full_name || "FUTURE FORUM";
    const initials = userName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    return BASE_NODES.map((n) =>
      n.id === "you" ? { ...n, label: userName, avatarUrl: userAvatar, initials } : n
    );
  }, [profile, user]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0) setDimensions({ w: width, h: Math.max(380, Math.min(height, 500)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const connectedIds = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const ids = new Set<string>();
    ids.add(hoveredNode);
    EDGES.forEach((e) => {
      if (e.from === hoveredNode) ids.add(e.to);
      if (e.to === hoveredNode) ids.add(e.from);
    });
    return ids;
  }, [hoveredNode]);

  const nodePos = useCallback(
    (n: GraphNode) => ({ x: n.x * dimensions.w, y: n.y * dimensions.h }),
    [dimensions]
  );

  // Stats
  const strengthCounts = useMemo(() => {
    const c = { strong: 0, medium: 0, weak: 0 };
    EDGES.forEach((e) => c[e.strength]++);
    return c;
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
      {/* Stats bar */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Network Graph</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {NODES.length} nodes · {EDGES.length} connections · {strengthCounts.strong} strong · {strengthCounts.medium} medium · {strengthCounts.weak} weak
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Strength legend */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#3B82F6" strokeWidth="3" opacity="0.9" /></svg>
              <span className="text-[9px] text-muted-foreground">Strong</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#93C5FD" strokeWidth="1.5" opacity="0.6" /></svg>
              <span className="text-[9px] text-muted-foreground">Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#BFDBFE" strokeWidth="1" opacity="0.3" strokeDasharray="4 6" /></svg>
              <span className="text-[9px] text-muted-foreground">Weak</span>
            </div>
          </div>
          {/* Type legend */}
          <div className="flex items-center gap-3">
            {(Object.entries(TYPE_COLORS) as [ConnectionType, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-muted-foreground">{TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: dimensions.h }}>
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
          <defs>
            {/* Glow filters per type */}
            {(Object.entries(TYPE_COLORS) as [ConnectionType, string][]).map(([type, color]) => (
              <filter key={type} id={`glow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.4" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Edges */}
          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
            const from = nodePos(fromNode);
            const to = nodePos(toNode);
            const cfg = STRENGTH_CONFIG[edge.strength];
            const color = TYPE_COLORS[edge.connectionType];
            const d = curvePath(from.x, from.y, to.x, to.y, edge.strength, i);

            const isNodeHighlighted = hoveredNode && connectedIds.has(edge.from) && connectedIds.has(edge.to);
            const isEdgeHovered = hoveredEdge === i;
            const isDimmed = hoveredNode && !isNodeHighlighted;

            const finalOpacity = isDimmed ? 0.1 : (isNodeHighlighted || isEdgeHovered) ? 1 : cfg.opacity;

            // Entry animation: stroke-dashoffset
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const pathLen = Math.sqrt(dx * dx + dy * dy) * 1.4; // approximate

            return (
              <g key={i}>
                {/* Glow for strong + highlighted */}
                {cfg.glow && (isNodeHighlighted || isEdgeHovered) && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={cfg.width + 4}
                    opacity={0.15}
                    filter={`url(#glow-${edge.connectionType})`}
                    className="pointer-events-none"
                  />
                )}
                {/* Main line */}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={cfg.width}
                  opacity={finalOpacity}
                  strokeDasharray={cfg.dash || (mounted ? "none" : `${pathLen}`)}
                  strokeDashoffset={mounted ? 0 : pathLen}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-dashoffset 0.6s ease-out, opacity 0.3s ease",
                    transitionDelay: mounted ? "0s" : `${i * 0.08}s`,
                  }}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredEdge(i)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                {/* Particles for strong/medium */}
                {mounted && cfg.particles > 0 && !isDimmed && Array.from({ length: cfg.particles }).map((_, p) => (
                  <circle
                    key={`p-${i}-${p}`}
                    r={cfg.particleSize}
                    fill="#FFFFFF"
                    opacity={edge.strength === "strong" ? 0.8 : 0.7}
                    className="pointer-events-none"
                  >
                    <animateMotion
                      dur={`${cfg.speed}s`}
                      repeatCount="indefinite"
                      path={d}
                      begin={`${p * 0.8}s`}
                    />
                  </circle>
                ))}

                {/* Edge hover tooltip */}
                {isEdgeHovered && (() => {
                  const mx = (from.x + to.x) / 2;
                  const my = (from.y + to.y) / 2;
                  return (
                    <foreignObject x={mx - 100} y={my - 60} width="200" height="90" className="pointer-events-none" style={{ overflow: "visible" }}>
                      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-[10px] font-semibold text-foreground">{TYPE_LABELS[edge.connectionType]}</span>
                          <span className="text-[9px] text-muted-foreground">· {edge.strength}</span>
                        </div>
                        {edge.lastActivity && <p className="text-[9px] text-muted-foreground">{edge.lastActivity}</p>}
                        {edge.sharedContext && <p className="text-[9px] text-primary font-mono">{edge.sharedContext}</p>}
                      </div>
                    </foreignObject>
                  );
                })()}

                {/* Edge label on node hover */}
                {edge.label && isNodeHighlighted && !isEdgeHovered && (() => {
                  const mx = (from.x + to.x) / 2;
                  const my = (from.y + to.y) / 2;
                  const perpDx = to.x - from.x;
                  const perpDy = to.y - from.y;
                  const len = Math.sqrt(perpDx * perpDx + perpDy * perpDy);
                  const sign = i % 2 === 0 ? 1 : -1;
                  const off = sign * Math.min(20, len * 0.1);
                  const nx = len > 0 ? -perpDy / len : 0;
                  const ny = len > 0 ? perpDx / len : 0;
                  return (
                    <text
                      x={mx + nx * off}
                      y={my + ny * off - 8}
                      textAnchor="middle"
                      className="text-[8px] font-mono font-semibold pointer-events-none"
                      fill={color}
                      opacity={0.9}
                    >
                      {edge.label}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {NODES.map((node, i) => {
          const pos = nodePos(node);
          const isHovered = hoveredNode === node.id;
          const isConnected = connectedIds.has(node.id);
          const isDimmed = hoveredNode !== null && !isConnected;
          const isYou = node.type === "you";
          const isWeak = !isYou && EDGES.some(
            (e) => ((e.from === node.id || e.to === node.id) && e.strength === "weak") &&
              !EDGES.some((e2) => (e2.from === node.id || e2.to === node.id) && e2.strength !== "weak")
          );
          const size = isYou ? 64 : isWeak ? 40 : 48;
          const borderColor = isYou ? "hsl(222, 47%, 11%)" : TYPE_COLORS[node.connectionType || "founder"];
          const borderWidth = isYou ? 2 : (
            EDGES.find((e) => (e.from === node.id || e.to === node.id))?.strength === "strong" ? 3 :
            EDGES.find((e) => (e.from === node.id || e.to === node.id))?.strength === "medium" ? 1.5 : 1
          );

          const nodeScale = isHovered ? 1.08 : isDimmed ? 0.92 : 1;

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: mounted ? (isDimmed ? 0.3 : isWeak && !isHovered ? 0.7 : 1) : 0,
                scale: mounted ? nodeScale : 0,
                x: pos.x - size / 2,
                y: pos.y - size / 2,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
                delay: isYou ? 0.3 : 0.3 + 0.6 + i * 0.08,
                opacity: { duration: 0.4 },
              }}
              className="absolute cursor-pointer"
              style={{ zIndex: isHovered ? 20 : 10, width: size, height: size, filter: isWeak && !isHovered ? "saturate(0.6)" : "none" }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Center node pulsing ring */}
              {isYou && !hoveredNode && (
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    inset: -4,
                    border: "2px solid hsl(222, 47%, 11%)",
                  }}
                  animate={{ scale: [1, 1.4, 1.4], opacity: [0.3, 0, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
                />
              )}

              {/* Hover glow ring */}
              {isHovered && !isYou && (
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    inset: -3,
                    border: `2px solid ${borderColor}`,
                    boxShadow: `0 0 12px ${borderColor}40`,
                  }}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 0.6 }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
                />
              )}

              <Avatar
                className="shadow-md transition-all duration-200"
                style={{
                  width: size,
                  height: size,
                  border: `${borderWidth}px solid ${borderColor}`,
                  backgroundColor: isYou ? "hsl(222, 47%, 11%)" : undefined,
                }}
              >
                <AvatarImage src={node.avatarUrl} alt={node.label} />
                <AvatarFallback
                  className="font-bold"
                  style={{
                    fontSize: size < 44 ? 10 : size > 56 ? 14 : 12,
                    backgroundColor: isYou ? "hsl(222, 47%, 11%)" : undefined,
                    color: isYou ? "hsl(210, 40%, 98%)" : undefined,
                  }}
                >
                  {node.initials || node.label.charAt(0)}
                </AvatarFallback>
              </Avatar>

              {/* Node tooltip */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg px-3 py-2 shadow-xl pointer-events-none whitespace-nowrap"
                    style={{ top: size + 8, zIndex: 30 }}
                  >
                    <p className="text-xs font-semibold text-foreground">{node.label}</p>
                    {node.subtitle && <p className="text-[10px] text-muted-foreground">{node.subtitle}</p>}
                    <div className="flex items-center gap-1.5 mt-1">
                      {node.connectionType && (
                        <>
                          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[node.connectionType] }} />
                          <span className="text-[9px] text-muted-foreground">{TYPE_LABELS[node.connectionType]}</span>
                          <span className="text-[9px] text-muted-foreground">·</span>
                        </>
                      )}
                      <span className="text-[9px] font-mono" style={{ color: borderColor }}>
                        {EDGES.filter((e) => e.from === node.id || e.to === node.id).length} connections
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
