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

const BRAND_ICONS: Record<string, string> = {
  google: "https://cdn.simpleicons.org/google/4285F4",
  linkedin: "https://cdn.simpleicons.org/linkedin/0A66C2",
  notion: "https://cdn.simpleicons.org/notion/FFFFFF",
  stripe: "https://cdn.simpleicons.org/stripe/635BFF",
  angellist: "https://cdn.simpleicons.org/angellist/FFFFFF",
  hubspot: "https://cdn.simpleicons.org/hubspot/FF7A59",
  attio: "https://www.google.com/s2/favicons?domain=attio.com&sz=128",
};
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import type { OnboardingState } from "./types";
import { PrivacyHubModal } from "./PrivacyHubModal";

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

// ── Compact Sensor Card (tighter for two-column layout) ──
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      onDragOver={isAngelList && !connected ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isAngelList ? () => setDragOver(false) : undefined}
      onDrop={isAngelList && !connected ? handleFileDrop : undefined}
      style={{
        boxShadow: connected ? `0 0 20px ${sensor.glowColor}` : syncing ? `0 0 12px ${sensor.glowColor}` : undefined,
      }}
      className={cn(
        "relative rounded-xl border p-3.5 transition-all duration-300 overflow-hidden",
        connected
          ? "border-white/[0.12] bg-[#0A0A0A]/95"
          : syncing
          ? "border-white/[0.10] bg-[#0A0A0A]/90"
          : "border-white/[0.08] bg-[#0A0A0A]/80 hover:border-indigo-500/30",
      )}
    >
      {connected && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
      )}

      <div className="relative flex items-center gap-3">
        {/* Icon */}
        <div className="relative shrink-0">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all",
            connected ? "border-white/10 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.03]"
          )}>
            {connected
              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
              : syncing
              ? <Loader2 className="h-3.5 w-3.5 text-white/40 animate-spin" />
              : <sensor.icon className="h-3.5 w-3.5 text-white/40" />
            }
          </div>
          {connected && (
            <motion.div
              className={cn("absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full", sensor.glowHsl)}
              animate={{ scale: [1, 1.4, 1], opacity: [0.9, 0.3, 0.9] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-white tracking-tight truncate">{sensor.name}</h3>
            {connected && !syncing && (
              <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 shrink-0">
                <motion.div className="h-1 w-1 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
              </div>
            )}
            {syncing && (
              <div className="flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 shrink-0">
                <Loader2 className="h-2.5 w-2.5 text-indigo-400 animate-spin" />
                <span className="text-[8px] font-bold text-indigo-400 uppercase">Syncing</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/25 mt-0.5 truncate">{sensor.desc}</p>
          {syncing && <p className="text-[9px] text-indigo-400 font-mono mt-1">{syncMessage}</p>}
          {connected && !syncing && (
            <p className="text-[9px] text-emerald-400/70 font-mono mt-1 truncate">{sensor.telemetry}</p>
          )}
        </div>

        {/* Action */}
        {!connected && !syncing && (
          <Button
            size="sm"
            onClick={() => {
              if (isAngelList) fileRef.current?.click();
              else onConnect();
            }}
            className={cn(
              "rounded-lg text-[11px] font-semibold h-7 px-3 shrink-0 transition-all",
              sensor.type === "identity"
                ? "bg-white text-[#0A0A0A] hover:bg-white/90"
                : "bg-transparent border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500/50"
            )}
          >
            Sync
          </Button>
        )}
      </div>

      {isAngelList && (
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={() => onConnect()} />
      )}
    </motion.div>
  );
}

// ── Value Panel Unlock Items ──
const UNLOCK_ITEMS: { id: string; icon: React.ElementType; locked: string; unlocked: string; detail: string }[] = [
  { id: "linkedin", icon: Network, locked: "Network Graph", unlocked: "Network Connectivity", detail: "2nd Degree: +4,218 paths" },
  { id: "google", icon: Mail, locked: "Warm Intro Paths", unlocked: "Inbox Intelligence", detail: "142 threads · 47 VC contacts" },
  { id: "notion", icon: FileText, locked: "Knowledge Base", unlocked: "Pipeline Synced", detail: "8 deal pages · 18 investors" },
  { id: "stripe", icon: TrendingUp, locked: "Traction Metrics", unlocked: "Revenue Verified", detail: "MRR: $12.4K · +18% MoM" },
];

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
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [prevCount, setPrevCount] = useState(connected.length);
  const meterBarRef = useRef<HTMLDivElement>(null);

  const meter = getEngineMeter(connected.length);
  const hasAnySynced = connected.length > 0;

  // Fire confetti on the meter bar when a new sensor is connected
  useEffect(() => {
    if (connected.length > prevCount && connected.length > 0) {
      if (meterBarRef.current) {
        const rect = meterBarRef.current.getBoundingClientRect();
        const x = (rect.left + rect.width * (meter / 100)) / window.innerWidth;
        const y = rect.top / window.innerHeight;
        confetti({
          particleCount: 60, spread: 50, origin: { x, y },
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
      const timer = setTimeout(() => { onNext(); }, 2000);
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
      className="w-full max-w-5xl mx-auto flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="text-center mb-2 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-white">Intelligence Sensor Suite</h1>
        <p className="text-[11px] text-white/40">Connect your data sources to power the engine.</p>
        <p className="text-[10px] text-white/30 mt-1.5 max-w-lg mx-auto leading-relaxed">
          To improve the recommendation engine and help your company land investor meetings, your data is key. See our{" "}
          <button
            onClick={() => setPrivacyOpen(true)}
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            privacy policy
          </button>{" "}
          if you have any questions.
        </p>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">

        {/* ── Left Column: Value Panel ── */}
        <div className="col-span-4 flex flex-col gap-3">
          {/* Intelligence Engine meter */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[11px] font-semibold text-white">Intelligence Engine</span>
              </div>
              <span className="text-[11px] font-bold font-mono text-indigo-400">{meter}%</span>
            </div>
            <div ref={meterBarRef} className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  meter === 100
                    ? "bg-gradient-to-r from-emerald-400 to-emerald-300"
                    : "bg-gradient-to-r from-indigo-500 to-emerald-400"
                )}
                animate={{ width: `${meter}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <AnimatePresence>
              {analysisComplete && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="flex items-center justify-center gap-1.5 mt-2 text-emerald-400"
                >
                  <Sparkles className="h-3 w-3" />
                  <span className="text-[10px] font-semibold font-mono">Analysis Complete</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dynamic value/benefits panel */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-3.5 w-3.5 text-indigo-400" />
              <h3 className="text-[11px] font-bold text-white uppercase tracking-wider">
                {hasAnySynced ? "Network Multiplier" : "Unlock Your Network Multiplier"}
              </h3>
            </div>

            <div className="space-y-2">
              {UNLOCK_ITEMS.map((item) => {
                const isActive = connected.includes(item.id);
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    className={cn(
                      "rounded-lg border p-2.5 transition-all duration-300",
                      isActive
                        ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                        : "border-white/[0.04] bg-white/[0.02]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md shrink-0",
                        isActive ? "bg-emerald-500/10" : "bg-white/[0.03]"
                      )}>
                        {isActive
                          ? <Check className="h-3 w-3 text-emerald-400" />
                          : <Lock className="h-3 w-3 text-white/20" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-[11px] font-semibold",
                          isActive ? "text-emerald-300" : "text-white/40"
                        )}>
                          {isActive ? item.unlocked : item.locked}
                        </p>
                        <AnimatePresence>
                          {isActive && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-[9px] text-emerald-400/60 font-mono mt-0.5"
                            >
                              {item.detail}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Placeholder text when nothing connected */}
            {!hasAnySynced && (
              <p className="text-[10px] text-white/20 mt-3 leading-relaxed">
                Connect at least one source to begin building your intelligence graph. Founders who sync 3+ sources get 3× more relevant investor matches.
              </p>
            )}
          </div>
        </div>

        {/* ── Right Column: Scrollable Integrations ── */}
        <div className="col-span-8 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {/* Recommended */}
            <div className="space-y-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-white/25 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
                Recommended · <span className="text-white/15">highest impact</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
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

            {/* Power */}
            <div className="space-y-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-white/25 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
                Power · <span className="text-white/15">for active fundraising</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
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
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between pt-2.5 pb-1 shrink-0 border-t border-white/[0.06] bg-[#050505]/80 backdrop-blur-sm mt-1">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[10px] text-white/30 leading-relaxed">
            Don't worry, you can pause or remove these selections anytime in Settings.
          </p>
          <p className="text-[10px] text-white/30 leading-relaxed">
            Your data is encrypted.{" "}
            <button
              onClick={() => setPrivacyOpen(true)}
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
            >
              Privacy &amp; AI Governance
            </button>
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-4">
          <Button
            size="sm"
            onClick={onNext}
            className="rounded-lg font-semibold text-xs px-6 transition-all bg-indigo-500 text-white hover:bg-indigo-400"
          >
            Launch <Sparkles className="h-3 w-3 ml-1.5" />
          </Button>
          <button
            onClick={onNext}
            className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
          >
            I'll sync the rest later
          </button>
        </div>
      </div>

      <PrivacyHubModal open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </motion.div>
  );
}
