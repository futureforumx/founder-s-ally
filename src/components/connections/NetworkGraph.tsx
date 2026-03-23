import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// ── Types ──
interface GraphNode {
  id: string;
  label: string;
  type: "you" | "contact" | "investor" | "firm";
  x: number;
  y: number;
  subtitle?: string;
  initials?: string;
  avatarUrl?: string;
  profileLink?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  strength: "strong" | "medium" | "weak";
}

// ── Static data (demo) — avatarUrl will be enriched at runtime for "you" node ──
const BASE_NODES: GraphNode[] = [
  { id: "you", label: "You", type: "you", x: 0.5, y: 0.5, initials: "Y", avatarUrl: "", profileLink: "#" },
  { id: "sj", label: "Sarah Jenkins", type: "contact", x: 0.25, y: 0.28, subtitle: "Angel Investor", initials: "SJ", avatarUrl: "https://i.pravatar.cc/96?u=sarah-jenkins", profileLink: "#sarah" },
  { id: "ar", label: "Alex Rivera", type: "contact", x: 0.72, y: 0.22, subtitle: "CEO, FlowMetrics", initials: "AR", avatarUrl: "https://i.pravatar.cc/96?u=alex-rivera", profileLink: "#alex" },
  { id: "ps", label: "Priya Sharma", type: "contact", x: 0.18, y: 0.68, subtitle: "CTO, DataLens AI", initials: "PS", avatarUrl: "https://i.pravatar.cc/96?u=priya-sharma", profileLink: "#priya" },
  { id: "mc", label: "Marcus Chen", type: "contact", x: 0.78, y: 0.72, subtitle: "Founder, BuildStack", initials: "MC", avatarUrl: "https://i.pravatar.cc/96?u=marcus-chen", profileLink: "#marcus" },
  { id: "jw", label: "James Wu", type: "contact", x: 0.38, y: 0.15, subtitle: "VP Eng, Stripe", initials: "JW", avatarUrl: "https://i.pravatar.cc/96?u=james-wu", profileLink: "#james" },
  { id: "f1", label: "1855 Capital", type: "firm", x: 0.12, y: 0.42, subtitle: "VC Fund", initials: "18", avatarUrl: "https://www.google.com/s2/favicons?domain=1855capital.com&sz=128", profileLink: "#1855" },
  { id: "f2", label: "Sequoia", type: "firm", x: 0.88, y: 0.42, subtitle: "VC Fund", initials: "SQ", avatarUrl: "https://www.google.com/s2/favicons?domain=sequoiacap.com&sz=128", profileLink: "#sequoia" },
  { id: "i1", label: "Mike March", type: "investor", x: 0.05, y: 0.2, subtitle: "Partner, 1855 Capital", initials: "MM", avatarUrl: "https://i.pravatar.cc/96?u=mike-march", profileLink: "#mike" },
  { id: "i2", label: "Lisa Patel", type: "investor", x: 0.92, y: 0.18, subtitle: "Partner, Sequoia", initials: "LP", avatarUrl: "https://i.pravatar.cc/96?u=lisa-patel", profileLink: "#lisa" },
  { id: "i3", label: "Tom Reid", type: "investor", x: 0.55, y: 0.85, subtitle: "Angel", initials: "TR", avatarUrl: "https://i.pravatar.cc/96?u=tom-reid", profileLink: "#tom" },
];

const EDGES: GraphEdge[] = [
  { from: "you", to: "sj", label: "14 emails", strength: "strong" },
  { from: "you", to: "ar", label: "LinkedIn", strength: "strong" },
  { from: "you", to: "ps", label: "Met at event", strength: "medium" },
  { from: "you", to: "mc", label: "Intro'd", strength: "strong" },
  { from: "you", to: "jw", label: "College", strength: "medium" },
  { from: "sj", to: "i1", label: "Co-invested", strength: "strong" },
  { from: "sj", to: "f1", strength: "medium" },
  { from: "ar", to: "f2", label: "Portfolio", strength: "strong" },
  { from: "ar", to: "i2", label: "Board", strength: "strong" },
  { from: "mc", to: "i3", label: "Backed by", strength: "medium" },
  { from: "ps", to: "f1", label: "Pitched", strength: "weak" },
  { from: "jw", to: "i2", label: "Former colleague", strength: "medium" },
  { from: "i1", to: "f1", strength: "strong" },
  { from: "i2", to: "f2", strength: "strong" },
];

// strand count and base width per strength
const STRAND_CONFIG = {
  strong: { count: 5, baseWidth: 1.8 },
  medium: { count: 3, baseWidth: 1.2 },
  weak:   { count: 2, baseWidth: 0.8 },
};

// Blue palette shades for strands (light to dark)
const BLUE_SHADES = [
  "hsl(210 80% 75%)",   // lightest
  "hsl(215 85% 65%)",
  "hsl(220 90% 55%)",
  "hsl(225 85% 45%)",
  "hsl(230 80% 38%)",   // darkest
];

const typeRingColor: Record<GraphNode["type"], string> = {
  you: "ring-primary/40",
  contact: "ring-accent/30",
  investor: "ring-accent/30",
  firm: "ring-primary/30",
};

const typeBorderColor: Record<GraphNode["type"], string> = {
  you: "border-primary",
  contact: "border-border",
  investor: "border-accent/40",
  firm: "border-primary/30",
};

/** Build a smooth quadratic bezier curve with a perpendicular offset */
function curvePath(x1: number, y1: number, x2: number, y2: number, offsetAmount: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return `M${x1},${y1} L${x2},${y2}`;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * offsetAmount;
  const cy = my + py * offsetAmount;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/** Generate offsets for multiple strands fanning out from a base curve */
function strandOffsets(edgeIndex: number, count: number, len: number): number[] {
  const baseSign = edgeIndex % 2 === 0 ? 1 : -1;
  const baseOffset = baseSign * Math.min(len * 0.22, 50 + (edgeIndex % 3) * 10);
  const spread = Math.min(len * 0.08, 18);
  const offsets: number[] = [];
  for (let s = 0; s < count; s++) {
    const t = count === 1 ? 0 : (s / (count - 1)) * 2 - 1; // -1 to 1
    offsets.push(baseOffset + t * spread);
  }
  return offsets;
}

export function NetworkGraph() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 420 });

  // Fetch user's profile avatar from DB
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

  // Enrich the "you" node with user's real avatar
  const NODES = useMemo(() => {
    const userAvatar =
      profile?.avatar_url ||
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      "";
    const userName = profile?.full_name || user?.user_metadata?.full_name || "You";
    const initials = userName
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return BASE_NODES.map((n) =>
      n.id === "you"
        ? { ...n, label: userName, avatarUrl: userAvatar, initials }
        : n
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

  return (
    <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Network Graph</p>
          <p className="text-xs text-muted-foreground mt-0.5">{NODES.length} nodes · {EDGES.length} connections · Hover to explore paths</p>
        </div>
        <div className="flex items-center gap-3">
          {(["you", "contact", "investor", "firm"] as const).map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-full border ${
                type === "you" ? "bg-primary border-primary" :
                type === "contact" ? "bg-secondary border-border" :
                type === "investor" ? "bg-accent/10 border-accent/30" :
                "bg-card border-primary/20"
              }`} />
              <span className="text-[9px] text-muted-foreground capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: dimensions.h }}>
        {/* SVG edges — smooth flowing curves */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <linearGradient id="edge-glow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
              <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
            </linearGradient>
            <filter id="edge-blur">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
            const from = nodePos(fromNode);
            const to = nodePos(toNode);
            const isHighlighted = hoveredNode && connectedIds.has(edge.from) && connectedIds.has(edge.to);
            const isDimmed = hoveredNode && !isHighlighted;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const cfg = STRAND_CONFIG[edge.strength];
            const offsets = strandOffsets(i, cfg.count, len);

            return (
              <g key={i}>
                {/* Multi-strand blue curves */}
                {offsets.map((offset, s) => {
                  const d = curvePath(from.x, from.y, to.x, to.y, offset);
                  const shade = BLUE_SHADES[s % BLUE_SHADES.length];
                  const highlightShade = BLUE_SHADES[Math.min(s, 2)];
                  return (
                    <g key={s}>
                      {/* Glow on highlight */}
                      {isHighlighted && s === Math.floor(cfg.count / 2) && (
                        <path
                          d={d}
                          fill="none"
                          stroke="hsl(215 90% 60%)"
                          strokeWidth={8}
                          opacity={0.1}
                          filter="url(#edge-blur)"
                        />
                      )}
                      <path
                        d={d}
                        fill="none"
                        stroke={isHighlighted ? highlightShade : shade}
                        strokeWidth={isHighlighted ? cfg.baseWidth * 1.4 : cfg.baseWidth}
                        opacity={isDimmed ? 0.04 : isHighlighted ? 0.9 : 0.35 + s * 0.08}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </g>
                  );
                })}
                {/* Edge label on highlight */}
                {edge.label && isHighlighted && (() => {
                  const midOffset = offsets[Math.floor(offsets.length / 2)];
                  const mx = (from.x + to.x) / 2;
                  const my = (from.y + to.y) / 2;
                  const pxN = len > 0 ? -dy / len : 0;
                  const pyN = len > 0 ? dx / len : 0;
                  return (
                    <text
                      x={mx + pxN * midOffset * 0.3}
                      y={my + pyN * midOffset * 0.3 - 10}
                      textAnchor="middle"
                      className="fill-[hsl(215_90%_70%)] text-[9px] font-mono font-semibold"
                    >
                      {edge.label}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* Animated pulse along highlighted curves */}
          {hoveredNode &&
            EDGES.filter((e) => connectedIds.has(e.from) && connectedIds.has(e.to)).map((edge, i) => {
              const from = nodePos(NODES.find((n) => n.id === edge.from)!);
              const to = nodePos(NODES.find((n) => n.id === edge.to)!);
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const offsets = strandOffsets(EDGES.indexOf(edge), STRAND_CONFIG[edge.strength].count, len);
              const midOffset = offsets[Math.floor(offsets.length / 2)];
              const d = curvePath(from.x, from.y, to.x, to.y, midOffset);
              return (
                <circle key={`pulse-${i}`} r="3" fill="hsl(210 85% 70%)" opacity="0.8">
                  <animateMotion dur="2s" repeatCount="indefinite" path={d} />
                </circle>
              );
            })}
        </svg>

        {/* Nodes with avatar profile pictures */}
        {NODES.map((node, i) => {
          const pos = nodePos(node);
          const isHovered = hoveredNode === node.id;
          const isConnected = connectedIds.has(node.id);
          const isDimmed = hoveredNode !== null && !isConnected;
          const size = node.type === "you" ? 48 : node.type === "firm" ? 40 : 36;

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: isDimmed ? 0.15 : 1,
                scale: isHovered ? 1.15 : 1,
                x: pos.x - size / 2,
                y: pos.y - size / 2,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: i * 0.04 }}
              className="absolute cursor-pointer"
              style={{ zIndex: isHovered ? 20 : 10, width: size, height: size }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Glow ring */}
              {(isHovered || (node.type === "you" && !hoveredNode)) && (
                <motion.div
                  className={`absolute inset-0 rounded-full ring-4 ${typeRingColor[node.type]}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.3, opacity: 0.5 }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
                  style={{ width: size, height: size }}
                />
              )}

              {/* Avatar node — links to profile */}
              <a href={node.profileLink || "#"} onClick={(e) => e.preventDefault()} className="block">
                <Avatar
                  className={`border-2 ${typeBorderColor[node.type]} shadow-md transition-all duration-200`}
                  style={{ width: size, height: size }}
                >
                  <AvatarImage src={node.avatarUrl} alt={node.label} />
                  <AvatarFallback
                    className={`font-bold ${
                      node.type === "you" ? "bg-primary text-primary-foreground" :
                      node.type === "firm" ? "bg-card text-foreground" :
                      node.type === "investor" ? "bg-accent/10 text-accent-foreground" :
                      "bg-secondary text-foreground"
                    }`}
                    style={{ fontSize: size < 40 ? 10 : 12 }}
                  >
                    {node.initials || node.label.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </a>

              {/* Tooltip */}
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
                    <p className="text-[9px] text-primary font-mono mt-1">
                      {EDGES.filter((e) => e.from === node.id || e.to === node.id).length} connections
                    </p>
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
