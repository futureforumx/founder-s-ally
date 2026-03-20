import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const LOG_LINES = [
  { tag: "INIT", text: "Initializing Neural Parser v3.4...", delay: 400, progressLabel: "Initializing...", progress: 8 },
  { tag: "WEB", text: "Scraping website & digital footprint...", delay: 900, progressLabel: "Scraping website...", progress: 22 },
  { tag: "PDF", text: "Decrypting Pitch Deck layers...", delay: 1400, progressLabel: "Parsing deck...", progress: 38 },
  { tag: "AI", text: "Extracting ARR, Burn, and NRR metrics...", delay: 2200, progressLabel: "Extracting metrics...", progress: 55, ghostTags: ["ARR: $2.4M", "NRR: 118%"] },
  { tag: "MATCH", text: "Cross-referencing 2026 SaaS Benchmarks...", delay: 3200, progressLabel: "Benchmarking...", progress: 70, ghostTags: ["Stage: Series A"] },
  { tag: "SEARCH", text: "Mapping direct competitors in sector...", delay: 4400, progressLabel: "Mapping competitors...", progress: 85, ghostTags: ["Competitors: 12"] },
  { tag: "OK", text: "Profile synthesized. Finalizing Dashboard...", delay: 5800, progressLabel: "Finalizing...", progress: 100 },
];

const RAW_JSON = `{
  "neural_parser": { "version": "3.4.1", "status": "active" },
  "scrape_engine": {
    "target": "cloudproduce.com",
    "pages_indexed": 47,
    "tokens_extracted": 18420
  },
  "deck_analysis": {
    "slides_parsed": 24,
    "confidence_matrix": [0.94, 0.88, 0.91, 0.87, 0.95],
    "key_frames": ["problem", "solution", "traction", "team", "ask"]
  },
  "metric_extraction": {
    "arr": { "value": "$2.4M", "confidence": 0.92 },
    "burn_rate": { "value": "$180K/mo", "confidence": 0.88 },
    "nrr": { "value": "118%", "confidence": 0.85 },
    "ltv_cac": { "value": "4.2x", "confidence": 0.79 }
  },
  "benchmark_engine": {
    "dataset": "2026_saas_benchmarks_v2",
    "peers_matched": 34,
    "percentile_rank": 72
  },
  "competitor_map": {
    "direct": 12,
    "indirect": 28,
    "threat_score": 0.64
  },
  "synthesis": {
    "health_score": 88,
    "investor_readiness": "high",
    "data_completeness": 0.88
  }
}`;

const TAG_STYLES: Record<string, { color: string; glow: string }> = {
  INIT: { color: "#60a5fa", glow: "0 0 8px rgba(96,165,250,0.5)" },
  WEB: { color: "#22d3ee", glow: "0 0 8px rgba(34,211,238,0.5)" },
  PDF: { color: "#c084fc", glow: "0 0 8px rgba(192,132,252,0.5)" },
  AI: { color: "#34d399", glow: "0 0 8px rgba(52,211,153,0.5)" },
  MATCH: { color: "#fbbf24", glow: "0 0 8px rgba(251,191,36,0.5)" },
  SEARCH: { color: "#fb923c", glow: "0 0 8px rgba(251,146,60,0.5)" },
  OK: { color: "#4ade80", glow: "0 0 10px rgba(74,222,128,0.6)" },
};

function ParticleBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const particles = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * 360;
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad) * 18;
    const ty = Math.sin(rad) * 18;
    return (
      <span
        key={i}
        className="absolute w-1 h-1 rounded-full"
        style={{
          background: "#60a5fa",
          boxShadow: "0 0 4px rgba(96,165,250,0.8)",
          animation: `particle-burst 0.5s ease-out forwards`,
          animationDelay: `${i * 30}ms`,
          ["--tx" as string]: `${tx}px`,
          ["--ty" as string]: `${ty}px`,
        }}
      />
    );
  });
  return <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">{particles}</span>;
}

function GhostTag({ label }: { label: string }) {
  return (
    <span
      className="absolute font-mono text-[10px] font-semibold pointer-events-none whitespace-nowrap"
      style={{
        color: "rgba(96,165,250,0.9)",
        textShadow: "0 0 6px rgba(96,165,250,0.5)",
        animation: "ghost-float 2s ease-out forwards",
        left: `${30 + Math.random() * 40}%`,
        bottom: "0",
      }}
    >
      {label}
    </span>
  );
}

interface AnalysisTerminalProps {
  companyName?: string;
  onComplete: () => void;
}

export function AnalysisTerminal({ companyName, onComplete }: AnalysisTerminalProps) {
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Initializing...");
  const [visibleLogs, setVisibleLogs] = useState<typeof LOG_LINES>([]);
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());
  const [burstIndex, setBurstIndex] = useState<number | null>(null);
  const [ghostTags, setGhostTags] = useState<{ id: number; label: string }[]>([]);
  const [showTechView, setShowTechView] = useState(false);
  const [complete, setComplete] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const ghostId = useRef(0);

  useEffect(() => {
    const timers = LOG_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLogs((prev) => [...prev, line]);
        setProgress(line.progress);
        setProgressLabel(line.progressLabel);
        if (i > 0) {
          setCompletedIndices((prev) => new Set(prev).add(i - 1));
          setBurstIndex(i - 1);
          setTimeout(() => setBurstIndex(null), 600);
        }
        if (line.ghostTags) {
          line.ghostTags.forEach((tag, ti) => {
            setTimeout(() => {
              const id = ghostId.current++;
              setGhostTags((prev) => [...prev, { id, label: tag }]);
              setTimeout(() => setGhostTags((prev) => prev.filter((g) => g.id !== id)), 2200);
            }, ti * 400);
          });
        }
      }, line.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs]);

  useEffect(() => {
    if (progress >= 100 && visibleLogs.length === LOG_LINES.length && !complete) {
      const timer = setTimeout(() => {
        setCompletedIndices((prev) => {
          const next = new Set(prev);
          next.add(LOG_LINES.length - 1);
          return next;
        });
        setComplete(true);
        setGlitch(true);
        setTimeout(() => {
          setGlitch(false);
          onComplete();
        }, 1200);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [progress, visibleLogs, complete, onComplete]);

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        {/* Glassmorphism backdrop */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />

        {/* Centered modal terminal — no close button */}
        <DialogPrimitive.Content
          className={`fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${
            glitch ? "animate-terminal-glitch" : ""
          }`}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Suppress default title/description for a11y */}
          <DialogPrimitive.Title className="sr-only">Analysis in progress</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Please wait while the analysis engine processes your data.</DialogPrimitive.Description>

          <style>{`
            @keyframes terminal-scan {
              0% { transform: translateY(-100%); }
              100% { transform: translateY(1000%); }
            }
            .laser-scan {
              position: absolute; top: 0; left: 0; width: 100%; height: 80px;
              background: linear-gradient(to bottom, transparent 0%, rgba(59,130,246,0.04) 50%, rgba(59,130,246,0.15) 95%, transparent 100%);
              animation: terminal-scan 3s linear infinite;
              pointer-events: none; z-index: 10;
            }
            @keyframes particle-burst {
              0% { opacity: 1; transform: translate(0, 0) scale(1); }
              100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0); }
            }
            @keyframes ghost-float {
              0% { opacity: 0; transform: translateY(0); }
              15% { opacity: 1; }
              70% { opacity: 0.6; }
              100% { opacity: 0; transform: translateY(-120px); }
            }
            .terminal-scrollbar::-webkit-scrollbar { width: 4px; }
            .terminal-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .terminal-scrollbar::-webkit-scrollbar-thumb { background: rgba(96,165,250,0.15); border-radius: 4px; }
            .terminal-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(96,165,250,0.35); }
            .terminal-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(96,165,250,0.15) transparent; }
          `}</style>

          {/* Terminal card */}
          <div className="relative mx-4">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/20 via-cyan-500/10 to-blue-500/20 blur-xl" />

            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: "#0B1120",
                border: "1px solid hsl(var(--border) / 0.3)",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
            >
              {!complete && <div className="laser-scan" />}

              {/* Title bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full" style={{ background: "#FF5F57" }} />
                  <div className="h-3 w-3 rounded-full" style={{ background: "#FEBD2E" }} />
                  <div className="h-3 w-3 rounded-full" style={{ background: "#27C840" }} />
                </div>
                <span className="font-mono text-[11px] tracking-wider" style={{ color: "rgba(148,163,184,0.6)" }}>
                  ANALYSIS_ENGINE — {companyName || "STARTUP"}.exec
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px]" style={{ color: "rgba(148,163,184,0.4)" }}>Technical View</span>
                    <Switch checked={showTechView} onCheckedChange={setShowTechView} className="scale-75 data-[state=checked]:bg-blue-500" />
                  </div>
                  {!complete && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                      <span className="font-mono text-[10px] font-semibold" style={{ color: "rgba(96,165,250,0.8)" }}>LIVE</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative p-6 space-y-6">
                {/* Radar */}
                <div className="flex justify-center">
                  <div className="relative h-28 w-28">
                    <svg className="absolute inset-0 h-full w-full animate-spin" style={{ animationDuration: "8s" }}>
                      <circle cx="56" cy="56" r="52" fill="none" stroke="rgba(56,130,246,0.1)" strokeWidth="1" />
                      <circle cx="56" cy="56" r="40" fill="none" stroke="rgba(56,130,246,0.07)" strokeWidth="1" />
                      <circle cx="56" cy="56" r="28" fill="none" stroke="rgba(56,130,246,0.05)" strokeWidth="1" />
                    </svg>
                    <svg className="absolute inset-0 h-full w-full animate-spin" style={{ animationDuration: "3s" }}>
                      <defs>
                        <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="rgba(56,130,246,0)" />
                          <stop offset="100%" stopColor="rgba(56,130,246,0.6)" />
                        </linearGradient>
                      </defs>
                      <line x1="56" y1="56" x2="56" y2="4" stroke="url(#sweep)" strokeWidth="2" />
                    </svg>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full animate-pulse" style={{ background: "rgba(56,130,246,0.8)", boxShadow: "0 0 20px rgba(56,130,246,0.5)" }} />
                    {[{ x: 30, y: 20, delay: "0s" }, { x: 75, y: 35, delay: "1s" }, { x: 45, y: 80, delay: "2s" }].map((dot, i) => (
                      <div key={i} className="absolute h-1.5 w-1.5 rounded-full animate-pulse" style={{ left: dot.x, top: dot.y, background: "rgba(34,211,238,0.7)", animationDelay: dot.delay }} />
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="text-center">
                  <p className="font-mono text-sm" style={{ color: "rgba(96,165,250,0.9)" }}>
                    {complete ? "SYSTEM ONLINE" : "ANALYZING…"}
                  </p>
                  <p className="font-mono text-[10px] mt-1" style={{ color: "rgba(148,163,184,0.5)" }}>
                    {complete ? "All systems nominal. Launching dashboard." : progressLabel}
                  </p>
                </div>

                {/* Log output */}
                <div className="relative">
                  <div
                    ref={logRef}
                    className="rounded-lg p-3 max-h-44 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1 terminal-scrollbar"
                    style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(148,163,184,0.06)" }}
                  >
                    {visibleLogs.map((line, i) => {
                      const isDimmed = completedIndices.has(i);
                      const isActive = i === visibleLogs.length - 1 && !complete;
                      const tagStyle = TAG_STYLES[line.tag] || TAG_STYLES.INIT;
                      return (
                        <div key={i} className="relative flex gap-2 transition-opacity duration-500" style={{ opacity: isDimmed ? 0.4 : 1 }}>
                          <span className="shrink-0" style={{ color: "rgba(148,163,184,0.25)" }}>{String(i + 1).padStart(2, "0")}</span>
                          <span className="shrink-0" style={{ color: "rgba(148,163,184,0.3)" }}>&gt;</span>
                          <span className="shrink-0 font-semibold" style={{ color: tagStyle.color, textShadow: isActive ? tagStyle.glow : "none" }}>[{line.tag}]</span>
                          <span style={{ color: isActive ? "rgba(226,232,240,0.95)" : "rgba(226,232,240,0.7)" }}>
                            {line.text}
                            {isActive && !complete && <span className="animate-pulse ml-0.5">▊</span>}
                          </span>
                          {isDimmed && <span className="ml-auto shrink-0" style={{ color: "rgba(74,222,128,0.5)" }}>✓</span>}
                          <ParticleBurst active={burstIndex === i} />
                        </div>
                      );
                    })}
                    {visibleLogs.length === 0 && (
                      <span style={{ color: "rgba(148,163,184,0.4)" }} className="animate-pulse">&gt; Booting analysis engine...▊</span>
                    )}
                  </div>
                  {ghostTags.map((g) => <GhostTag key={g.id} label={g.label} />)}
                </div>

                {/* Tech view */}
                {showTechView && (
                  <div
                    className="rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed animate-fade-in terminal-scrollbar"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(148,163,184,0.06)", color: "rgba(34,211,238,0.6)" }}
                  >
                    <pre className="whitespace-pre-wrap">{RAW_JSON}</pre>
                  </div>
                )}

                {/* Progress */}
                <div className="space-y-2">
                  <div className="relative h-9 rounded-lg overflow-hidden font-mono text-[11px] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(148,163,184,0.08)" }}>
                    <div className="absolute inset-0 transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: complete ? "rgba(34,197,94,0.25)" : "linear-gradient(90deg, rgba(56,130,246,0.15), rgba(34,211,238,0.25))" }} />
                    <span className="relative z-10 tracking-wide" style={{ color: complete ? "rgba(74,222,128,0.9)" : "rgba(148,163,184,0.7)" }}>
                      {complete ? "✓ Analysis Complete" : `${progressLabel} — ${Math.round(progress)}%`}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: complete ? "rgba(34,197,94,0.7)" : "linear-gradient(90deg, rgba(56,130,246,0.5), rgba(34,211,238,0.7))", boxShadow: complete ? "0 0 10px rgba(34,197,94,0.4)" : "0 0 10px rgba(56,130,246,0.3)" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
