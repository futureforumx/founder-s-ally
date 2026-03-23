import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Building2, Users, Briefcase } from "lucide-react";

// ── Types ──
interface GraphNode {
  id: string;
  label: string;
  type: "you" | "contact" | "investor" | "firm";
  x: number;
  y: number;
  subtitle?: string;
  initials?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  strength: "strong" | "medium" | "weak";
}

// ── Static data (demo) ──
const NODES: GraphNode[] = [
  { id: "you", label: "You", type: "you", x: 0.5, y: 0.5 },
  { id: "sj", label: "Sarah Jenkins", type: "contact", x: 0.25, y: 0.28, subtitle: "Angel Investor", initials: "SJ" },
  { id: "ar", label: "Alex Rivera", type: "contact", x: 0.72, y: 0.22, subtitle: "CEO, FlowMetrics", initials: "AR" },
  { id: "ps", label: "Priya Sharma", type: "contact", x: 0.18, y: 0.68, subtitle: "CTO, DataLens AI", initials: "PS" },
  { id: "mc", label: "Marcus Chen", type: "contact", x: 0.78, y: 0.72, subtitle: "Founder, BuildStack", initials: "MC" },
  { id: "jw", label: "James Wu", type: "contact", x: 0.38, y: 0.15, subtitle: "VP Eng, Stripe", initials: "JW" },
  { id: "f1", label: "1855 Capital", type: "firm", x: 0.12, y: 0.42, subtitle: "VC Fund", initials: "18" },
  { id: "f2", label: "Sequoia", type: "firm", x: 0.88, y: 0.42, subtitle: "VC Fund", initials: "SQ" },
  { id: "i1", label: "Mike March", type: "investor", x: 0.05, y: 0.2, subtitle: "Partner, 1855 Capital", initials: "MM" },
  { id: "i2", label: "Lisa Patel", type: "investor", x: 0.92, y: 0.18, subtitle: "Partner, Sequoia", initials: "LP" },
  { id: "i3", label: "Tom Reid", type: "investor", x: 0.55, y: 0.85, subtitle: "Angel", initials: "TR" },
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

const strengthColor = {
  strong: "hsl(var(--primary))",
  medium: "hsl(var(--muted-foreground) / 0.4)",
  weak: "hsl(var(--muted-foreground) / 0.15)",
};

const strengthWidth = { strong: 2, medium: 1.5, weak: 1 };

const typeStyles: Record<GraphNode["type"], { bg: string; border: string; text: string; ring: string; icon: React.ElementType }> = {
  you: { bg: "bg-primary", border: "border-primary", text: "text-primary-foreground", ring: "ring-primary/30", icon: User },
  contact: { bg: "bg-secondary", border: "border-border", text: "text-foreground", ring: "ring-accent/20", icon: Users },
  investor: { bg: "bg-accent/10", border: "border-accent/30", text: "text-accent-foreground", ring: "ring-accent/20", icon: Briefcase },
  firm: { bg: "bg-card", border: "border-primary/20", text: "text-foreground", ring: "ring-primary/20", icon: Building2 },
};

export function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 420 });

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
          {(["you", "contact", "investor", "firm"] as const).map((type) => {
            const s = typeStyles[type];
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${s.bg} ${s.border} border`} />
                <span className="text-[9px] text-muted-foreground capitalize">{type}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: dimensions.h }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
            const from = nodePos(fromNode);
            const to = nodePos(toNode);
            const isHighlighted = hoveredNode && connectedIds.has(edge.from) && connectedIds.has(edge.to);
            const isDimmed = hoveredNode && !isHighlighted;

            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isHighlighted ? "hsl(var(--primary))" : strengthColor[edge.strength]}
                  strokeWidth={isHighlighted ? 2.5 : strengthWidth[edge.strength]}
                  opacity={isDimmed ? 0.08 : isHighlighted ? 1 : 0.5}
                  className="transition-all duration-300"
                />
                {edge.label && isHighlighted && (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-primary text-[9px] font-mono font-semibold"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {/* Animated pulse along highlighted edges */}
          {hoveredNode &&
            EDGES.filter((e) => connectedIds.has(e.from) && connectedIds.has(e.to)).map((edge, i) => {
              const from = nodePos(NODES.find((n) => n.id === edge.from)!);
              const to = nodePos(NODES.find((n) => n.id === edge.to)!);
              return (
                <circle key={`pulse-${i}`} r="3" fill="hsl(var(--primary))" opacity="0.7">
                  <animateMotion
                    dur="2s"
                    repeatCount="indefinite"
                    path={`M${from.x},${from.y} L${to.x},${to.y}`}
                  />
                </circle>
              );
            })}
        </svg>

        {/* Nodes */}
        {NODES.map((node, i) => {
          const pos = nodePos(node);
          const style = typeStyles[node.type];
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
                  className={`absolute inset-0 rounded-full ring-4 ${style.ring}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.3, opacity: 0.5 }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
                  style={{ width: size, height: size }}
                />
              )}

              {/* Node circle */}
              <div
                className={`relative flex items-center justify-center rounded-full border-2 ${style.bg} ${style.border} ${style.text} font-bold shadow-md transition-all duration-200`}
                style={{ width: size, height: size, fontSize: size < 40 ? 11 : 13 }}
              >
                {node.initials || node.label.charAt(0)}
              </div>

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
