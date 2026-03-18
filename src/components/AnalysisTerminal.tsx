import { useState, useEffect, useRef, useCallback } from "react";
import { Switch } from "@/components/ui/switch";

const LOG_LINES = [
  { tag: "INFO", text: "Initializing Neural Parser v3.4...", delay: 400 },
  { tag: "DATA", text: "Web-hook established: scanning digital footprint...", delay: 900 },
  { tag: "PDF", text: "Decrypting Pitch Deck layers...", delay: 1400 },
  { tag: "AI", text: "Extracting ARR, Burn, and NRR metrics...", delay: 2200 },
  { tag: "MATCH", text: "Cross-referencing 2026 SaaS Benchmarks...", delay: 3200 },
  { tag: "SEARCH", text: "Mapping direct competitors in sector...", delay: 4400 },
  { tag: "SUCCESS", text: "Profile synthesized. Finalizing Dashboard...", delay: 5800 },
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

const TAG_COLORS: Record<string, string> = {
  INFO: "text-blue-400",
  DATA: "text-cyan-400",
  PDF: "text-purple-400",
  AI: "text-emerald-400",
  MATCH: "text-yellow-400",
  SEARCH: "text-orange-400",
  SUCCESS: "text-green-400",
};

interface AnalysisTerminalProps {
  companyName?: string;
  onComplete: () => void;
}

export function AnalysisTerminal({ companyName, onComplete }: AnalysisTerminalProps) {
  const [progress, setProgress] = useState(0);
  const [visibleLogs, setVisibleLogs] = useState<typeof LOG_LINES>([]);
  const [typingIndex, setTypingIndex] = useState(0);
  const [showTechView, setShowTechView] = useState(false);
  const [complete, setComplete] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<number>(0);

  // Progress bar
  useEffect(() => {
    const duration = 7000;
    const interval = 50;
    const step = 100 / (duration / interval);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          return 100;
        }
        return Math.min(p + step, 100);
      });
    }, interval);
    return () => clearInterval(timer);
  }, []);

  // Log lines with typewriter
  useEffect(() => {
    const timers = LOG_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLogs((prev) => [...prev, line]);
        setTypingIndex(i);
      }, line.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleLogs]);

  // Completion trigger
  useEffect(() => {
    if (progress >= 100 && !complete) {
      const timer = setTimeout(() => {
        setComplete(true);
        setGlitch(true);
        setTimeout(() => {
          setGlitch(false);
          onComplete();
        }, 1200);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [progress, complete, onComplete]);

  // Radar angle animation
  useEffect(() => {
    let raf: number;
    const animate = () => {
      radarRef.current = (radarRef.current + 1.5) % 360;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center transition-all duration-300 ${
        glitch ? "animate-terminal-glitch" : ""
      }`}
      style={{ background: "#0B0E14" }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Terminal card */}
      <div className="relative w-full max-w-2xl mx-4">
        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/20 via-cyan-500/10 to-blue-500/20 blur-xl" />

        <div
          className="relative rounded-2xl border overflow-hidden"
          style={{
            background: "rgba(15, 20, 30, 0.85)",
            backdropFilter: "blur(20px)",
            borderColor: "rgba(56, 130, 246, 0.15)",
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: "rgba(56, 130, 246, 0.1)" }}
          >
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full" style={{ background: "#FF5F57" }} />
              <div className="h-3 w-3 rounded-full" style={{ background: "#FEBD2E" }} />
              <div className="h-3 w-3 rounded-full" style={{ background: "#27C840" }} />
            </div>
            <span className="font-mono text-[11px] tracking-wider" style={{ color: "rgba(148, 163, 184, 0.7)" }}>
              COPILOT_ANALYSIS_ENGINE — {companyName || "STARTUP"}.exec
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px]" style={{ color: "rgba(148, 163, 184, 0.5)" }}>
                Technical View
              </span>
              <Switch
                checked={showTechView}
                onCheckedChange={setShowTechView}
                className="scale-75 data-[state=checked]:bg-blue-500"
              />
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Radar / DNA animation */}
            <div className="flex justify-center">
              <div className="relative h-28 w-28">
                {/* Outer ring */}
                <svg className="absolute inset-0 h-full w-full animate-spin" style={{ animationDuration: "8s" }}>
                  <circle cx="56" cy="56" r="52" fill="none" stroke="rgba(56, 130, 246, 0.1)" strokeWidth="1" />
                  <circle cx="56" cy="56" r="40" fill="none" stroke="rgba(56, 130, 246, 0.07)" strokeWidth="1" />
                  <circle cx="56" cy="56" r="28" fill="none" stroke="rgba(56, 130, 246, 0.05)" strokeWidth="1" />
                </svg>
                {/* Radar sweep */}
                <svg className="absolute inset-0 h-full w-full animate-spin" style={{ animationDuration: "3s" }}>
                  <defs>
                    <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(56, 130, 246, 0)" />
                      <stop offset="100%" stopColor="rgba(56, 130, 246, 0.6)" />
                    </linearGradient>
                  </defs>
                  <line x1="56" y1="56" x2="56" y2="4" stroke="url(#sweep)" strokeWidth="2" />
                </svg>
                {/* Center dot */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full animate-pulse"
                  style={{ background: "rgba(56, 130, 246, 0.8)", boxShadow: "0 0 20px rgba(56, 130, 246, 0.5)" }}
                />
                {/* Ping dots */}
                {[
                  { x: 30, y: 20, delay: "0s" },
                  { x: 75, y: 35, delay: "1s" },
                  { x: 45, y: 80, delay: "2s" },
                ].map((dot, i) => (
                  <div
                    key={i}
                    className="absolute h-1.5 w-1.5 rounded-full animate-pulse"
                    style={{
                      left: dot.x,
                      top: dot.y,
                      background: "rgba(34, 211, 238, 0.7)",
                      animationDelay: dot.delay,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Status text */}
            <div className="text-center">
              <p className="font-mono text-sm" style={{ color: "rgba(56, 130, 246, 0.9)" }}>
                {complete ? "SYSTEM ONLINE" : "ANALYZING…"}
              </p>
              <p className="font-mono text-[10px] mt-1" style={{ color: "rgba(148, 163, 184, 0.5)" }}>
                {complete
                  ? "All systems nominal. Launching dashboard."
                  : `Processing ${Math.round(progress)}% complete`}
              </p>
            </div>

            {/* Log output */}
            <div
              ref={logRef}
              className="rounded-lg p-3 max-h-44 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1"
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(56, 130, 246, 0.08)",
              }}
            >
              {visibleLogs.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0" style={{ color: "rgba(148, 163, 184, 0.3)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="shrink-0">&gt;</span>
                  <span className={`shrink-0 font-semibold ${TAG_COLORS[line.tag] || "text-blue-400"}`}>
                    [{line.tag}]
                  </span>
                  <span style={{ color: "rgba(226, 232, 240, 0.8)" }}>
                    {line.text}
                    {i === visibleLogs.length - 1 && !complete && (
                      <span className="animate-pulse ml-0.5">▊</span>
                    )}
                  </span>
                </div>
              ))}
              {visibleLogs.length === 0 && (
                <span style={{ color: "rgba(148, 163, 184, 0.4)" }} className="animate-pulse">
                  &gt; Booting analysis engine...▊
                </span>
              )}
            </div>

            {/* Technical / raw JSON view */}
            {showTechView && (
              <div
                className="rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed animate-fade-in"
                style={{
                  background: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(56, 130, 246, 0.06)",
                  color: "rgba(34, 211, 238, 0.6)",
                }}
              >
                <pre className="whitespace-pre-wrap">{RAW_JSON}</pre>
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-2">
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ background: "rgba(56, 130, 246, 0.1)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-200 ease-linear"
                  style={{
                    width: `${progress}%`,
                    background: complete
                      ? "rgba(34, 197, 94, 0.8)"
                      : "linear-gradient(90deg, rgba(56, 130, 246, 0.6), rgba(34, 211, 238, 0.8))",
                    boxShadow: complete
                      ? "0 0 12px rgba(34, 197, 94, 0.4)"
                      : "0 0 12px rgba(56, 130, 246, 0.3)",
                  }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px]" style={{ color: "rgba(148, 163, 184, 0.4)" }}>
                <span>0%</span>
                <span>{Math.round(progress)}%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
