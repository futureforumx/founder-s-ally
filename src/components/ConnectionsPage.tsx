import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Linkedin, Twitter, Zap, CheckCircle2, Lock,
  Shield, RefreshCw, ArrowRight, Sparkles, AlertCircle,
  Database, Users, Network, TrendingUp, BarChart3, X as XIcon,
  Settings2, Activity, Upload, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import confetti from "canvas-confetti";

// ── Types ──
type SourceKey = "google" | "linkedin" | "twitter" | "angellist";

const STORAGE_KEY = "community-connections-status";
const SYNC_DETAIL_KEY = "connections-sync-detail";
const MODAL_DISMISSED_KEY = "connections-modal-dismissed";

const ALL_KEYS: SourceKey[] = ["google", "linkedin", "twitter", "angellist"];

function loadConnected(): Record<SourceKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // migrate old "gmail" key
      if ("gmail" in parsed && !("google" in parsed)) {
        parsed.google = parsed.gmail;
        delete parsed.gmail;
      }
      return { google: false, linkedin: false, twitter: false, angellist: false, ...parsed };
    }
  } catch {}
  return { google: false, linkedin: false, twitter: false, angellist: false };
}
function saveConnected(s: Record<SourceKey, boolean>) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function loadSyncDetails(): Record<SourceKey, { lastSynced: string | null }> {
  try {
    const raw = localStorage.getItem(SYNC_DETAIL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach((k) => (def[k] = { lastSynced: null }));
  return def;
}
function saveSyncDetails(d: Record<SourceKey, { lastSynced: string | null }>) { localStorage.setItem(SYNC_DETAIL_KEY, JSON.stringify(d)); }

// ── Sensor Type ──
type SensorType = "identity" | "pipeline" | "ingestor";

interface SourceConfig {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  glowColor: string;
  glowHsl: string;
  description: string;
  sensorType: SensorType;
  typeLabel: string;
  liveMessage: string;
  connectedStats: { label: string; value: string }[];
  syncStages: string[];
  unlockToast: string;
  buttonLabel: string;
}

const SOURCES: SourceConfig[] = [
  {
    key: "google", label: "Google Workspace", icon: Mail, sensorType: "pipeline",
    typeLabel: "Intelligence Pipeline",
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.35)]", glowHsl: "bg-indigo-500",
    description: "Gmail + Calendar — unified workspace sync for intro paths & meetings",
    liveMessage: "Scan Status: Active · 142 threads analyzed",
    connectedStats: [
      { label: "Threads Analyzed", value: "142" },
      { label: "VC Contacts", value: "47" },
      { label: "Signals Found", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning inbox...", "Mapping calendar...", "Building signal graph...", "Complete ✓"],
    unlockToast: "🔓 Warm Intro Paths unlocked",
    buttonLabel: "Sync Google Workspace",
  },
  {
    key: "linkedin", label: "LinkedIn", icon: Linkedin, sensorType: "identity",
    typeLabel: "Professional Identity",
    glowColor: "shadow-[0_0_24px_rgba(59,130,246,0.3)]", glowHsl: "bg-blue-500",
    description: "Map your professional network to discover 1st & 2nd degree paths",
    liveMessage: "Identity Mapped · Network Connectivity: 2nd Degree (+4,218)",
    connectedStats: [
      { label: "Connections", value: "312" },
      { label: "2nd Degree", value: "4,218" },
      { label: "Mutual Intros", value: "7" },
    ],
    syncStages: ["Authenticating...", "Mapping network...", "Resolving paths...", "Building graph...", "Complete ✓"],
    unlockToast: "🔓 Network Graph + 2nd-degree paths unlocked",
    buttonLabel: "Verify Identity",
  },
  {
    key: "twitter", label: "X (Twitter)", icon: Twitter, sensorType: "pipeline",
    typeLabel: "Intelligence Pipeline",
    glowColor: "shadow-[0_0_24px_rgba(255,255,255,0.12)]", glowHsl: "bg-white",
    description: "Track social sentiment, mentions, and investor engagement",
    liveMessage: "Sentiment analysis active · 89 mutual follows tracked",
    connectedStats: [
      { label: "Mutual Follows", value: "89" },
      { label: "VCs Tracked", value: "12" },
      { label: "Sentiment", value: "Positive" },
    ],
    syncStages: ["Authenticating...", "Scanning timeline...", "Analyzing sentiment...", "Mapping investors...", "Complete ✓"],
    unlockToast: "🔓 Social Sentiment unlocked",
    buttonLabel: "Sync Pipeline",
  },
  {
    key: "angellist", label: "AngelList", icon: Zap, sensorType: "ingestor",
    typeLabel: "Portfolio Discovery",
    glowColor: "shadow-[0_0_24px_rgba(251,191,36,0.3)]", glowHsl: "bg-amber-400",
    description: "Import investors via CSV for AI enrichment & portfolio mapping",
    liveMessage: "Importing 47 investors... Enriching with AI.",
    connectedStats: [
      { label: "Investors Imported", value: "47" },
      { label: "Enriched", value: "42" },
      { label: "Tracked VCs", value: "23" },
    ],
    syncStages: ["Parsing CSV...", "Validating entries...", "Enriching with AI...", "Building portfolio graph...", "Complete ✓"],
    unlockToast: "🔓 Portfolio Intelligence unlocked",
    buttonLabel: "Import CSV",
  },
];

const INTRO_PATHS = [
  { chain: "You → David Park → Roelof Botha at Sequoia Capital", strength: 82 },
  { chain: "You → Rina Patel → Sarah Guo at Conviction", strength: 74 },
  { chain: "You → James Wu → Benchmark Capital (Bill Gurley)", strength: 61 },
];

// ── Sync simulation ──
async function simulateSync(key: SourceKey, onProgress: (progress: number, message: string) => void): Promise<void> {
  const source = SOURCES.find((s) => s.key === key)!;
  const stages = source.syncStages;
  const stops = [10, 60, 85, 99, 100];
  for (let i = 0; i < stages.length; i++) {
    onProgress(stops[i], stages[i]);
    await new Promise((r) => setTimeout(r, i === stages.length - 1 ? 400 : 800));
  }
}

// ── Sparkline ──
function SparklinePulse() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3, 0.7, 0.5, 0.8, 0.6].map((h, i) => (
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

// ── Terminal Logs ──
const TERMINAL_LOGS = [
  { time: "19:02", source: "GMAIL", msg: "4 new investor threads identified" },
  { time: "19:03", source: "CALENDAR", msg: "VC meeting detected → auto-tagged" },
  { time: "19:05", source: "STRIPE", msg: "MRR metrics recalculated → $12.4K" },
  { time: "19:07", source: "LINKEDIN", msg: "2nd-degree graph updated (+14 nodes)" },
  { time: "19:09", source: "ANGELLIST", msg: "Portfolio enrichment: 3 new investors matched" },
  { time: "19:11", source: "SYSTEM", msg: "Intelligence Engine score: 72%" },
];

// ── Page Component ──
export function ConnectionsPage() {
  const [connected, setConnected] = useState<Record<SourceKey, boolean>>(loadConnected);
  const [syncDetails, setSyncDetails] = useState(loadSyncDetails);
  const [syncStates, setSyncStates] = useState<Record<SourceKey, { syncing: boolean; progress: number; message: string }>>(() => {
    const init: any = {};
    ALL_KEYS.forEach((k) => (init[k] = { syncing: false, progress: 0, message: "" }));
    return init;
  });
  const [activeConnect, setActiveConnect] = useState<SourceKey | null>(null);
  const [hoveredCard, setHoveredCard] = useState<SourceKey | null>(null);
  const [showModal, setShowModal] = useState(() => {
    try {
      const dismissed = localStorage.getItem(MODAL_DISMISSED_KEY);
      if (dismissed === "true") return false;
      const conn = loadConnected();
      return !ALL_KEYS.some((k) => conn[k]);
    } catch { return true; }
  });

  const connectedCount = ALL_KEYS.filter((k) => connected[k]).length;
  const remaining = Math.max(0, 3 - connectedCount);

  useEffect(() => {
    if (connectedCount >= 3) {
      const key = "full-analytics-toasted";
      try {
        if (!localStorage.getItem(key)) {
          toast.success("🔓 Full analytics dashboard unlocked");
          localStorage.setItem(key, "true");
        }
      } catch {}
    }
  }, [connectedCount]);

  const handleConnect = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Connecting..." } }));

    await new Promise((r) => setTimeout(r, 1500));
    await simulateSync(key, (progress, message) => {
      setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });

    const now = new Date().toISOString();
    const nextConnected = { ...connected, [key]: true };
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };

    setConnected(nextConnected);
    setSyncDetails(nextDetails);
    saveConnected(nextConnected);
    saveSyncDetails(nextDetails);
    setSyncStates((prev) => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);

    // Confetti burst
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ["#6366f1", "#34d399", "#818cf8"] });

    const source = SOURCES.find((s) => s.key === key)!;
    toast.success("Intelligence Pipeline Established", { description: source.unlockToast });
  }, [activeConnect, connected, syncDetails]);

  const handleResync = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Re-syncing..." } }));
    await simulateSync(key, (progress, message) => {
      setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });
    const now = new Date().toISOString();
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };
    setSyncDetails(nextDetails);
    saveSyncDetails(nextDetails);
    setSyncStates((prev) => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);
    toast.success(`${SOURCES.find((s) => s.key === key)!.label} re-synced`);
  }, [activeConnect, syncDetails]);

  const handleDisconnect = (key: SourceKey) => {
    const nextConnected = { ...connected, [key]: false };
    setConnected(nextConnected);
    saveConnected(nextConnected);
    toast(`${SOURCES.find((s) => s.key === key)!.label} disconnected`);
  };

  const dismissModal = () => {
    setShowModal(false);
    try { localStorage.setItem(MODAL_DISMISSED_KEY, "true"); } catch {}
  };

  function formatLastSynced(iso: string | null): string {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ── Sensor Card ──
  function SensorCard({ source, index }: { source: SourceConfig; index: number }) {
    const Icon = source.icon;
    const isConnected = connected[source.key];
    const sync = syncStates[source.key];
    const isSyncing = sync.syncing;
    const isHovered = hoveredCard === source.key;
    const isAngelList = source.key === "angellist";
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
        onMouseEnter={() => setHoveredCard(source.key)}
        onMouseLeave={() => setHoveredCard(null)}
        onDragOver={isAngelList && !isConnected ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={isAngelList ? () => setDragOver(false) : undefined}
        onDrop={isAngelList && !isConnected ? (e) => { e.preventDefault(); setDragOver(false); handleConnect(source.key); } : undefined}
        style={{
          transform: isHovered ? "perspective(800px) rotateX(-1.5deg) rotateY(1.5deg)" : "perspective(800px) rotateX(0) rotateY(0)",
          transition: "transform 0.3s ease",
          boxShadow: isConnected ? `0 0 28px ${source.glowColor.match(/rgba\([^)]+\)/)?.[0] || "transparent"}` : "none",
        }}
        className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${
          isConnected
            ? "border-white/[0.12] bg-[#0A0A0A]/95 backdrop-blur-xl"
            : dragOver
            ? "border-indigo-500/40 bg-[#0A0A0A]/90"
            : "border-white/[0.06] bg-[#0A0A0A]/80 hover:border-white/[0.12]"
        }`}
      >
        {isConnected && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
        )}

        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                  isConnected ? "border-white/10 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.03]"
                }`}>
                  {isConnected
                    ? <Check className="h-4 w-4 text-emerald-400" />
                    : <Icon className={`h-4 w-4 ${dragOver ? "text-indigo-400" : "text-white/40"}`} />
                  }
                </div>
                {isConnected && (
                  <motion.div
                    className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowHsl}`}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.9, 0.3, 0.9] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white tracking-tight">{source.label}</h3>
                <p className="text-[10px] text-white/25 font-mono uppercase tracking-wider mt-0.5">{source.typeLabel}</p>
              </div>
            </div>

            <AnimatePresence>
              {isHovered && isConnected && !isSyncing && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5 text-white/40" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[11px] text-white/30 mb-4">{source.description}</p>

          {/* Live telemetry */}
          {isConnected && !isSyncing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <SparklinePulse />
                <span className="text-[10px] text-emerald-400/80 font-mono">{source.liveMessage}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {source.connectedStats.map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5">
                    <p className="text-lg font-bold text-white font-mono tracking-tight">{stat.value}</p>
                    <p className="text-[9px] text-white/25 uppercase tracking-wider font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* AngelList drag-drop */}
          {isAngelList && !isConnected && !isSyncing && dragOver && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 rounded-lg border border-dashed border-indigo-500/40 bg-indigo-500/5 p-4 text-center">
              <Upload className="h-6 w-6 text-indigo-400 mx-auto mb-1" />
              <p className="text-[11px] text-indigo-300 font-mono">Drop CSV to import investors</p>
            </motion.div>
          )}

          {/* Sync progress */}
          <AnimatePresence>
            {isSyncing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/50 font-mono">{sync.message}</span>
                    <span className="text-[11px] text-white/30 font-mono">{sync.progress}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
                      animate={{ width: `${sync.progress}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-[10px] text-white/20 font-mono">Historical backfill in progress...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-between">
            {!isConnected && !isSyncing && (
              <Button
                size="sm"
                onClick={() => {
                  if (isAngelList) fileRef.current?.click();
                  else handleConnect(source.key);
                }}
                disabled={activeConnect !== null}
                className={`rounded-lg text-xs font-semibold h-9 px-5 transition-all ${
                  source.sensorType === "identity"
                    ? "bg-white text-[#0A0A0A] hover:bg-white/90"
                    : "bg-transparent border border-white/20 text-white/70 hover:bg-white/[0.06] hover:border-white/30 hover:text-white"
                }`}
              >
                {source.buttonLabel}
              </Button>
            )}

            {isConnected && !isSyncing && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
                    <motion.div className="h-1.5 w-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
                  </div>
                  {syncDetails[source.key]?.lastSynced && (
                    <span className="text-[10px] text-white/20 font-mono">{formatLastSynced(syncDetails[source.key].lastSynced)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04]" onClick={() => handleResync(source.key)} disabled={activeConnect !== null}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-sync
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/[0.06]" onClick={() => handleDisconnect(source.key)}>
                    Disconnect
                  </Button>
                </div>
              </div>
            )}

            {isSyncing && (
              <div className="flex items-center gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-4 w-4 border-2 border-white/10 border-t-white/60 rounded-full" />
                <span className="text-[11px] text-white/40 font-mono">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom progress during backfill */}
        {isSyncing && (
          <div className="h-[2px] bg-white/[0.04]">
            <motion.div className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-500" animate={{ width: `${sync.progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        )}

        {/* Hidden file input for AngelList */}
        {isAngelList && <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={() => handleConnect(source.key)} />}
      </motion.div>
    );
  }

  // ── Modal Card (compact) ──
  function ModalSourceCard({ source }: { source: SourceConfig }) {
    const Icon = source.icon;
    const isConnected = connected[source.key];
    const sync = syncStates[source.key];
    const isSyncing = sync.syncing;

    return (
      <motion.div
        layout
        className={`rounded-xl border p-3.5 transition-all duration-200 ${
          isConnected
            ? "border-white/[0.08] bg-white/[0.03]"
            : isSyncing ? "border-white/[0.1] bg-white/[0.02]" : "border-white/[0.06] bg-transparent hover:bg-white/[0.02]"
        }`}
        style={isConnected ? { boxShadow: `0 0 12px ${source.glowColor.match(/rgba\([^)]+\)/)?.[0] || "transparent"}` } : {}}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${isConnected ? "border-white/10 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.03]"}`}>
                {isConnected ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Icon className="h-4 w-4 text-white/40" />}
              </div>
              {isConnected && (
                <motion.div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowHsl}`} animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-white">{source.label}</span>
              <p className="text-[9px] text-white/20 font-mono uppercase tracking-wider mt-0.5">{source.typeLabel}</p>
              {isConnected && !isSyncing && <p className="text-[10px] text-emerald-400/60 font-mono mt-1">{source.liveMessage.split("·")[0]}.</p>}
            </div>
          </div>

          {!isConnected && !isSyncing && (
            <Button
              size="sm"
              className={`shrink-0 rounded-lg text-xs font-semibold h-8 px-3.5 ${
                source.sensorType === "identity" ? "bg-white text-[#0A0A0A] hover:bg-white/90" : "bg-transparent border border-white/20 text-white/60 hover:bg-white/[0.06]"
              }`}
              onClick={() => handleConnect(source.key)}
              disabled={activeConnect !== null}
            >
              {source.sensorType === "identity" ? "Verify" : "Sync"}
            </Button>
          )}

          {isSyncing && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-4 w-4 border-2 border-white/10 border-t-white/60 rounded-full shrink-0" />}

          {isConnected && !isSyncing && (
            <div className="flex items-center gap-1.5 shrink-0">
              <motion.div className="h-1.5 w-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
              <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider">Live</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isSyncing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 space-y-1.5">
                <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full" animate={{ width: `${sync.progress}%` }} transition={{ duration: 0.4 }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/30 font-mono">{sync.message}</span>
                  <span className="text-[10px] text-white/20 font-mono">{sync.progress}%</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* ═══ CONNECT MODAL ═══ */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={dismissModal} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="w-full max-w-[480px] rounded-2xl bg-[#0A0A0A] border border-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden">
                <div className="p-6 pb-4 flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
                    <Shield className="h-5 w-5 text-white/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-white">Intelligence Sensor Suite</h2>
                    <p className="text-sm text-white/30 mt-0.5">Link data sources to power the engine</p>
                  </div>
                  <button onClick={dismissModal} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-white/30 hover:text-white/60 shrink-0">
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-6 space-y-2 max-h-[50vh] overflow-y-auto">
                  {SOURCES.map((source) => <ModalSourceCard key={source.key} source={source} />)}
                </div>
                <div className="px-6 pt-4 pb-2">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {ALL_KEYS.map((k) => (
                      <div key={k} className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${connected[k] ? "bg-emerald-400" : "bg-white/10"}`} />
                    ))}
                  </div>
                  {remaining > 0
                    ? <p className="text-xs text-white/30 text-center">Connect {remaining} more source{remaining !== 1 ? "s" : ""} to unlock full analytics</p>
                    : <p className="text-xs text-emerald-400 font-medium text-center">✓ Full analytics unlocked</p>
                  }
                </div>
                <div className="p-6 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-white/20" />
                    <span className="text-[11px] text-white/20">Read-only · Data never shared</span>
                  </div>
                  {connectedCount >= 3
                    ? <Button size="sm" className="rounded-lg text-xs font-semibold h-9 px-5 bg-white text-[#0A0A0A] hover:bg-white/90" onClick={dismissModal}>Launch Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Button>
                    : <button onClick={dismissModal} className="text-xs text-white/30 hover:text-white/50 transition-colors">Skip for now</button>
                  }
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ PAGE ═══ */}
      <div className={showModal ? "pointer-events-none select-none" : ""}>
        <div className="space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-2xl font-bold text-foreground">Intelligence Sensor Suite</h1>
            <p className="text-sm text-muted-foreground mt-1">Network intelligence, warm intros, and data pipelines</p>
          </motion.div>

          {/* Banner */}
          {connectedCount === 0 && !showModal && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm text-amber-800 dark:text-amber-300 font-medium">Connect Google Workspace to unlock warm intro paths</span>
              </div>
              <Button size="sm" variant="outline" className="rounded-lg text-xs h-8 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10" onClick={() => setShowModal(true)}>
                Connect →
              </Button>
            </motion.div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { icon: Database, label: "Sources", value: `${connectedCount}`, sub: "/4", color: "bg-primary/10", iconColor: "text-primary" },
              { icon: Users, label: "VC Contacts", value: connected.google ? "47" : "—", sub: null, color: "bg-accent/10", iconColor: "text-accent" },
              { icon: Network, label: "Intro Paths", value: connected.linkedin ? "18" : "—", sub: null, color: "bg-accent/10", iconColor: "text-accent" },
              { icon: TrendingUp, label: "Intelligence", value: connectedCount >= 3 ? "Active" : "Limited", sub: null, color: "bg-accent/10", iconColor: "text-accent" },
            ].map((kpi, i) => (
              <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${kpi.color}`}><kpi.icon className={`w-3.5 h-3.5 ${kpi.iconColor}`} /></div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">{kpi.value}</span>
                  {kpi.sub && <span className="text-sm text-muted-foreground">{kpi.sub}</span>}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Sensor Grid */}
          <div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex items-center gap-2 mb-4">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Sensor Grid</h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOURCES.map((source, i) => <SensorCard key={source.key} source={source} index={i} />)}
            </div>
          </div>

          {/* Live Traffic Terminal */}
          {connectedCount >= 1 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-white/[0.06] bg-[#050505] p-5 overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <motion.div className="h-2 w-2 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">Live Traffic</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {TERMINAL_LOGS.map((log, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.1 }} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-white/20">[{log.time}]</span>
                    <span className="text-indigo-400 font-semibold">{log.source}:</span>
                    <span className="text-white/40">{log.msg}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Post-Modal Panels */}
          {connectedCount >= 3 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Warm Intro Paths */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-bold text-foreground">Warm Intro Paths</h3>
                </div>
                <div className="space-y-3">
                  {INTRO_PATHS.map((path, i) => (
                    <div key={i} className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-foreground font-medium">{path.chain}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${path.strength}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{path.strength}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Network Graph */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Network className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-bold text-foreground">Network Graph</h3>
                </div>
                <div className="relative h-48 flex items-center justify-center">
                  <svg viewBox="0 0 200 200" className="w-full h-full max-w-[200px]">
                    {[45, 105, 165, 255, 315].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 55;
                      const y = 100 + Math.sin(rad) * 55;
                      return <line key={`l1-${i}`} x1="100" y1="100" x2={x} y2={y} stroke="hsl(var(--accent))" strokeWidth="1.5" opacity="0.4" />;
                    })}
                    {[20, 70, 130, 200, 240, 290, 340].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const mx = 100 + Math.cos(rad) * 55;
                      const my = 100 + Math.sin(rad) * 55;
                      const ox = 100 + Math.cos(rad) * 85;
                      const oy = 100 + Math.sin(rad) * 85;
                      return <line key={`l2-${i}`} x1={mx} y1={my} x2={ox} y2={oy} stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.2" />;
                    })}
                    <circle cx="100" cy="100" r="10" fill="hsl(var(--accent))" />
                    <text x="100" y="103" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">You</text>
                    {[45, 105, 165, 255, 315].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 55;
                      const y = 100 + Math.sin(rad) * 55;
                      return <circle key={`n1-${i}`} cx={x} cy={y} r="6" fill="hsl(var(--foreground))" opacity="0.7" />;
                    })}
                    {[20, 70, 130, 200, 240, 290, 340].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 85;
                      const y = 100 + Math.sin(rad) * 85;
                      return <circle key={`n2-${i}`} cx={x} cy={y} r="4" fill="hsl(var(--muted-foreground))" opacity="0.3" />;
                    })}
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-foreground/70" /><span className="text-[10px] text-muted-foreground">1st degree</span></div>
                  <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" /><span className="text-[10px] text-muted-foreground">2nd degree</span></div>
                </div>
              </div>

              {/* Sync Status */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-bold text-foreground">Sync Status</h3>
                </div>
                <div className="space-y-2.5">
                  {SOURCES.filter((s) => connected[s.key]).map((source) => {
                    const Icon = source.icon;
                    return (
                      <div key={source.key} className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                        <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-foreground/60" /><span className="text-xs font-medium text-foreground">{source.label}</span></div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{formatLastSynced(syncDetails[source.key]?.lastSynced)}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleResync(source.key)} disabled={activeConnect !== null}><RefreshCw className="h-3 w-3 text-muted-foreground" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                  {[{ l: "Total contacts scanned", v: "2,764" }, { l: "VC contacts found", v: "47" }, { l: "Intro paths mapped", v: "18" }].map((r) => (
                    <div key={r.l} className="flex justify-between text-[10px]"><span className="text-muted-foreground">{r.l}</span><span className="font-mono text-foreground font-semibold">{r.v}</span></div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Partial lock panels */}
          {connectedCount >= 1 && connectedCount < 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { label: "Warm Intro Paths", lockMsg: "Connect Google to unlock" },
                { label: "Network Graph", lockMsg: "Connect LinkedIn to unlock" },
                { label: "Sync Status", lockMsg: "Connect 3+ sources to unlock" },
              ].map((panel) => (
                <div key={panel.label} className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-card/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                    <Lock className="h-5 w-5 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground font-medium">{panel.lockMsg}</p>
                  </div>
                  <div className="opacity-30">
                    <h3 className="text-sm font-bold text-foreground mb-3">{panel.label}</h3>
                    <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/40" />)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center justify-between rounded-xl bg-muted/20 border border-border p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">Your data is secure</p>
                <p className="text-[10px] text-muted-foreground">Read-only access · AES-256 encrypted · Never shared with third parties</p>
              </div>
            </div>
            {connectedCount >= 3 && (
              <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-accent" /><span className="text-xs font-semibold text-accent">Full Intelligence Active</span></div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
