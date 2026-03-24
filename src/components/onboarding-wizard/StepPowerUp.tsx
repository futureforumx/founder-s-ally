import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ArrowRight, Zap, Mail, FileText, Linkedin, CreditCard,
  BarChart3, Database, Upload, Settings2, Loader2, Sparkles,
  Lock, Network, TrendingUp, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import type { OnboardingState } from "./types";

// ── Sensor Configs ──
type SensorType = "identity" | "pipeline" | "ingestor";

interface SensorConfig {
  id: string;
  name: string;
  icon: React.ElementType;
  desc: string;
  type: SensorType;
  typeLabel: string;
  glowColor: string;
  glowHsl: string;
  telemetry: string;
  stat?: { label: string; value: string };
  buttonLabel: string;
  tier: "recommended" | "power";
  syncStages: string[];
}

const SENSORS: SensorConfig[] = [
  {
    id: "google", name: "Google Workspace", icon: Mail, type: "pipeline",
    typeLabel: "Intelligence Pipeline", desc: "Gmail + Calendar — unified workspace sync",
    glowColor: "rgba(99,102,241,0.35)", glowHsl: "bg-indigo-500",
    telemetry: "Scan Status: Active · Signals: 142 found",
    stat: { label: "Threads Analyzed", value: "142" },
    buttonLabel: "Sync Google Workspace", tier: "recommended",
    syncStages: ["Authenticating...", "Scanning inbox...", "Mapping calendar...", "Complete ✓"],
  },
  {
    id: "linkedin", name: "LinkedIn", icon: Linkedin, type: "identity",
    typeLabel: "Professional Identity", desc: "Network graph & 2nd-degree connections",
    glowColor: "rgba(59,130,246,0.3)", glowHsl: "bg-blue-500",
    telemetry: "Identity Mapped · Network Connectivity: 2nd Degree (+4,218)",
    stat: { label: "2nd Degree", value: "4,218" },
    buttonLabel: "Verify Identity", tier: "recommended",
    syncStages: ["Authenticating...", "Mapping network...", "Building graph...", "Complete ✓"],
  },
  {
    id: "notion", name: "Notion", icon: FileText, type: "pipeline",
    typeLabel: "Intelligence Pipeline", desc: "Syncs your fundraising pipeline & docs",
    glowColor: "rgba(99,102,241,0.25)", glowHsl: "bg-indigo-400",
    telemetry: "Pipeline synced · 8 active deal pages",
    stat: { label: "Pages Synced", value: "8" },
    buttonLabel: "Sync Pipeline", tier: "recommended",
    syncStages: ["Authenticating...", "Scanning workspace...", "Indexing pages...", "Complete ✓"],
  },
  {
    id: "stripe", name: "Stripe", icon: CreditCard, type: "pipeline",
    typeLabel: "Intelligence Pipeline", desc: "Live revenue & growth metrics",
    glowColor: "rgba(16,185,129,0.3)", glowHsl: "bg-emerald-500",
    telemetry: "Revenue Verified · Last update: 2 mins ago",
    stat: { label: "MRR Verified", value: "$12.4K" },
    buttonLabel: "Sync Pipeline", tier: "power",
    syncStages: ["Authenticating...", "Fetching metrics...", "Calculating MRR...", "Complete ✓"],
  },
  {
    id: "angellist", name: "AngelList", icon: Zap, type: "ingestor",
    typeLabel: "Portfolio Discovery", desc: "Import investors via CSV for AI enrichment",
    glowColor: "rgba(251,191,36,0.3)", glowHsl: "bg-amber-400",
    telemetry: "Importing 47 investors... Enriching with AI.",
    stat: { label: "Investors Imported", value: "47" },
    buttonLabel: "Import CSV", tier: "power",
    syncStages: ["Reading CSV...", "Enriching investors...", "Complete ✓"],
  },
  {
    id: "hubspot", name: "HubSpot", icon: BarChart3, type: "pipeline",
    typeLabel: "Intelligence Pipeline", desc: "CRM deal flow tracking",
    glowColor: "rgba(249,115,22,0.25)", glowHsl: "bg-orange-500",
    telemetry: "12 deals tracked · Pipeline value: $2.1M",
    stat: { label: "Deals Tracked", value: "12" },
    buttonLabel: "Sync Pipeline", tier: "power",
    syncStages: ["Authenticating...", "Fetching contacts...", "Syncing deals...", "Complete ✓"],
  },
  {
    id: "attio", name: "Attio", icon: Database, type: "pipeline",
    typeLabel: "Intelligence Pipeline", desc: "Relationship intelligence",
    glowColor: "rgba(168,85,247,0.25)", glowHsl: "bg-purple-500",
    telemetry: "Relationship graph: 89 nodes active",
    stat: { label: "Relationships", value: "89" },
    buttonLabel: "Sync Pipeline", tier: "power",
    syncStages: ["Authenticating...", "Fetching people...", "Mapping relationships...", "Complete ✓"],
  },
];

const RECOMMENDED_IDS = ["google", "linkedin", "notion"];

function getEngineMeter(connectedCount: number): number {
  if (connectedCount === 0) return 0;
  if (connectedCount === 1) return 40;
  if (connectedCount === 2) return 70;
  return 100;
}

// ── Sparkline ──
function SparklinePulse() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3].map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-emerald-400/70"
          animate={{ height: [`${h * 12}px`, `${h * 5}px`, `${h * 12}px`] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Sensor Card ──
function SensorCard({
  sensor, connected, syncing, syncMessage, onConnect, index,
}: {
  sensor: SensorConfig;
  connected: boolean;
  syncing: boolean;
  syncMessage: string;
  onConnect: () => void;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAngelList = sensor.id === "angellist";

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onConnect();
  }, [onConnect]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={isAngelList && !connected ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isAngelList ? () => setDragOver(false) : undefined}
      onDrop={isAngelList && !connected ? handleFileDrop : undefined}
      style={{
        boxShadow: connected ? `0 0 24px ${sensor.glowColor}` : undefined,
      }}
      className={cn(
        "relative rounded-2xl border p-5 transition-all duration-300 overflow-hidden",
        connected
          ? "border-white/[0.12] bg-[#0A0A0A]/95 backdrop-blur-xl"
          : syncing
          ? "border-white/[0.10] bg-[#0A0A0A]/90"
          : dragOver
          ? "border-indigo-500/40 bg-[#0A0A0A]/90"
          : "border-white/[0.06] bg-[#0A0A0A]/80 hover:border-white/[0.12]",
      )}
    >
      {/* Gradient overlay */}
      {connected && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                connected ? "border-white/10 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.03]"
              )}>
                {connected
                  ? <Check className="h-4 w-4 text-emerald-400" />
                  : syncing
                  ? <Loader2 className="h-4 w-4 text-white/40 animate-spin" />
                  : <sensor.icon className={cn("h-4 w-4", dragOver ? "text-indigo-400" : "text-white/40")} />
                }
              </div>
              {/* Heartbeat dot */}
              {connected && (
                <motion.div
                  className={cn("absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full", sensor.glowHsl)}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.9, 0.3, 0.9] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white tracking-tight">{sensor.name}</h3>
              <p className="text-[10px] text-white/25 font-mono uppercase tracking-wider mt-0.5">{sensor.typeLabel}</p>
            </div>
          </div>

          {/* Configure cog on hover */}
          <AnimatePresence>
            {hovered && connected && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]"
              >
                <Settings2 className="h-3 w-3 text-white/30" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-[11px] text-white/30 mb-4">{sensor.desc}</p>

        {/* Sync progress */}
        {syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 text-[10px] text-indigo-400 font-mono">
              <Loader2 className="h-3 w-3 animate-spin" />
              {syncMessage || "Connecting..."}
            </div>
          </motion.div>
        )}

        {/* Live telemetry */}
        {connected && !syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <SparklinePulse />
              <span className="text-[10px] text-emerald-400/80 font-mono">{sensor.telemetry}</span>
            </div>
            {sensor.stat && (
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5 inline-block">
                <p className="text-lg font-bold text-white font-mono tracking-tight">{sensor.stat.value}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider font-medium">{sensor.stat.label}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* AngelList drag-drop hint */}
        {isAngelList && !connected && dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-3 rounded-lg border border-dashed border-indigo-500/40 bg-indigo-500/5 p-3 text-center"
          >
            <Upload className="h-5 w-5 text-indigo-400 mx-auto mb-1" />
            <p className="text-[11px] text-indigo-300 font-mono">Drop CSV to import</p>
          </motion.div>
        )}

        {/* Action */}
        <div className="flex items-center justify-between">
          {!connected && !syncing && (
            <Button
              size="sm"
              onClick={() => {
                if (isAngelList) fileRef.current?.click();
                else onConnect();
              }}
              className={cn(
                "rounded-lg text-xs font-semibold h-8 px-4 transition-all",
                sensor.type === "identity"
                  ? "bg-white text-[#0A0A0A] hover:bg-white/90"
                  : "bg-transparent border border-white/20 text-white/60 hover:bg-white/[0.06] hover:border-white/30 hover:text-white"
              )}
            >
              {sensor.buttonLabel}
            </Button>
          )}

          {syncing && (
            <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1">
              <Loader2 className="h-3 w-3 text-indigo-400 animate-spin" />
              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Connecting...</span>
            </div>
          )}

          {connected && !syncing && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
              <motion.div
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input for AngelList */}
      {isAngelList && (
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={() => onConnect()}
        />
      )}
    </motion.div>
  );
}

// ── Live Traffic Terminal ──
const TERMINAL_LOGS = [
  { time: "19:02", source: "GMAIL", msg: "4 new investor threads identified" },
  { time: "19:05", source: "STRIPE", msg: "MRR metrics recalculated → $12.4K" },
  { time: "19:07", source: "LINKEDIN", msg: "2nd-degree graph updated (+14 nodes)" },
  { time: "19:09", source: "NOTION", msg: "Deal pipeline synced — 3 active rounds" },
  { time: "19:11", source: "SYSTEM", msg: "Intelligence Engine score: 72%" },
];

function LiveTrafficTerminal({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          className="h-2 w-2 rounded-full bg-emerald-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">Live Traffic</span>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {TERMINAL_LOGS.map((log, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.12 }}
            className="flex items-center gap-2 text-[11px] font-mono"
          >
            <span className="text-white/20">[{log.time}]</span>
            <span className="text-indigo-400 font-semibold">{log.source}:</span>
            <span className="text-white/40">{log.msg}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Component ──
interface StepPowerUpProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepPowerUp({ state, update, onNext, onBack }: StepPowerUpProps) {
  const connected = state.connectedIntegrations;
  const [syncingIds, setSyncingIds] = useState<Record<string, boolean>>({});
  const [syncMessages, setSyncMessages] = useState<Record<string, string>>({});
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [prevCount, setPrevCount] = useState(connected.length);
  const meterBarRef = useRef<HTMLDivElement>(null);

  const meter = getEngineMeter(connected.length);
  const hasAnySynced = connected.length > 0;

  // Fire confetti on the meter bar when a new sensor is connected
  useEffect(() => {
    if (connected.length > prevCount && connected.length > 0) {
      // Confetti burst centered on the progress bar
      if (meterBarRef.current) {
        const rect = meterBarRef.current.getBoundingClientRect();
        const x = (rect.left + rect.width * (meter / 100)) / window.innerWidth;
        const y = rect.top / window.innerHeight;
        confetti({
          particleCount: 60,
          spread: 50,
          origin: { x, y },
          colors: ["#6366f1", "#34d399", "#818cf8", "#fbbf24"],
        });
      }
      setPrevCount(connected.length);
    }
  }, [connected.length, prevCount, meter]);

  // Auto-advance when engine hits 100%
  useEffect(() => {
    if (meter === 100 && !analysisComplete) {
      setAnalysisComplete(true);
      const timer = setTimeout(() => {
        onNext();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [meter, analysisComplete, onNext]);

  const handleConnect = useCallback(async (id: string) => {
    if (connected.includes(id) || syncingIds[id]) return;

    setSyncingIds(prev => ({ ...prev, [id]: true }));
    setSyncMessages(prev => ({ ...prev, [id]: "Connecting..." }));

    const sensor = SENSORS.find(s => s.id === id)!;
    const stages = sensor.syncStages;

    for (let i = 0; i < stages.length; i++) {
      setSyncMessages(prev => ({ ...prev, [id]: stages[i] }));
      await new Promise(r => setTimeout(r, i === stages.length - 1 ? 400 : 800));
    }

    setSyncingIds(prev => ({ ...prev, [id]: false }));
    setSyncMessages(prev => ({ ...prev, [id]: "" }));
    update({ connectedIntegrations: [...connected, id] });
    toast({ title: "Intelligence Pipeline Established", description: `${sensor.name} is now active.` });
  }, [connected, syncingIds, update]);

  const recommended = SENSORS.filter((s) => s.tier === "recommended");
  const power = SENSORS.filter((s) => s.tier === "power");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-2xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Intelligence Sensor Suite</h1>
        <p className="text-sm text-white/40">Connect your data sources to power the engine.</p>
      </div>

      {/* Intelligence Engine meter */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Intelligence Engine</span>
          </div>
          <span className="text-xs font-bold font-mono text-indigo-400">{meter}%</span>
        </div>
        <div ref={meterBarRef} className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full transition-all",
              meter === 100
                ? "bg-gradient-to-r from-emerald-400 to-emerald-300"
                : "bg-gradient-to-r from-indigo-500 to-emerald-400"
            )}
            animate={{ width: `${meter}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Analysis complete state */}
        <AnimatePresence>
          {analysisComplete && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center justify-center gap-2 mt-3 text-emerald-400"
            >
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold font-mono">Analysis Complete — Advancing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recommended Sensors */}
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/25">
          Recommended · <span className="text-white/15">Most founders connect these first</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recommended.map((s, i) => (
            <SensorCard
              key={s.id}
              sensor={s}
              connected={connected.includes(s.id)}
              syncing={!!syncingIds[s.id]}
              syncMessage={syncMessages[s.id] || ""}
              onConnect={() => handleConnect(s.id)}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Power Sensors */}
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/25">
          Power · <span className="text-white/15">For founders actively fundraising</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {power.map((s, i) => (
            <SensorCard
              key={s.id}
              sensor={s}
              connected={connected.includes(s.id)}
              syncing={!!syncingIds[s.id]}
              syncMessage={syncMessages[s.id] || ""}
              onConnect={() => handleConnect(s.id)}
              index={i + recommended.length}
            />
          ))}
        </div>
      </div>

      {/* Live Traffic Terminal */}
      <LiveTrafficTerminal visible={connected.length >= 2} />

      {/* Fixed Bottom Navigation */}
      <div className="flex flex-col items-center gap-3 pt-4 pb-2">
        <div className="flex items-center gap-3 w-full justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/40 hover:text-white hover:bg-white/[0.04]"
          >
            Back
          </Button>
          <Button
            size="sm"
            onClick={onNext}
            disabled={!hasAnySynced}
            className={cn(
              "rounded-lg font-semibold text-xs px-6 transition-all",
              hasAnySynced
                ? "bg-indigo-500 text-white hover:bg-indigo-400"
                : "bg-white/[0.06] text-white/30 cursor-not-allowed"
            )}
          >
            Continue to Privacy <ArrowRight className="h-3 w-3 ml-1.5" />
          </Button>
        </div>
        <button
          onClick={onNext}
          className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
        >
          I'll sync the rest later
        </button>
      </div>
    </motion.div>
  );
}
