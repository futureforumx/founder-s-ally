import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Linkedin, Twitter, CheckCircle2, Lock,
  Shield, RefreshCw, Sparkles, AlertCircle,
  Database, Users, Network, TrendingUp, BarChart3, X as XIcon,
  Settings2, Activity, Check, CreditCard, BookOpen, FileText,
  MessageSquare, Contact, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";

// ── Types ──
export type SourceKey = "google" | "linkedin" | "notion" | "stripe" | "granola" | "hubspot" | "attio" | "twitter";

const STORAGE_KEY = "community-connections-status";
const SYNC_DETAIL_KEY = "connections-sync-detail";

export const ALL_KEYS: SourceKey[] = ["google", "linkedin", "notion", "stripe", "granola", "hubspot", "attio", "twitter"];

export function loadConnected(): Record<SourceKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if ("gmail" in parsed && !("google" in parsed)) { parsed.google = parsed.gmail; delete parsed.gmail; }
      const result: any = {};
      ALL_KEYS.forEach(k => result[k] = parsed[k] || false);
      return result;
    }
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach(k => def[k] = false);
  return def;
}
export function saveConnected(s: Record<SourceKey, boolean>) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function loadSyncDetails(): Record<SourceKey, { lastSynced: string | null }> {
  try {
    const raw = localStorage.getItem(SYNC_DETAIL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach(k => def[k] = { lastSynced: null });
  return def;
}
function saveSyncDetails(d: Record<SourceKey, { lastSynced: string | null }>) { localStorage.setItem(SYNC_DETAIL_KEY, JSON.stringify(d)); }

// ── Sensor Config ──
type SensorSection = "recommended" | "power" | "signal";

interface SourceConfig {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  glowColor: string;
  glowHsl: string;
  description: string;
  categoryTag: string;
  liveStats: string;
  connectedStats: { label: string; value: string }[];
  syncStages: string[];
  unlockToast: string;
  connectLabel: string;
  disconnectWarning: string;
  section: SensorSection;
  note?: string;
}

const SOURCES: SourceConfig[] = [
  // ── RECOMMENDED ──
  {
    key: "google", label: "Google Workspace", icon: Mail, section: "recommended",
    categoryTag: "INTELLIGENCE PIPELINE",
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.35)]", glowHsl: "bg-indigo-500",
    description: "Gmail + Calendar — unified workspace sync",
    liveStats: "142 threads analyzed",
    connectedStats: [
      { label: "Threads Analyzed", value: "142" },
      { label: "VC Contacts", value: "47" },
      { label: "Signals Found", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning inbox...", "Mapping calendar...", "Building signal graph...", "Complete ✓"],
    unlockToast: "🔓 Warm Intro Paths unlocked",
    connectLabel: "Connect with Google",
    disconnectWarning: "Disconnect Google Workspace? This will pause email thread analysis.",
  },
  {
    key: "linkedin", label: "LinkedIn", icon: Linkedin, section: "recommended",
    categoryTag: "PROFESSIONAL IDENTITY",
    glowColor: "shadow-[0_0_24px_rgba(59,130,246,0.3)]", glowHsl: "bg-blue-500",
    description: "Map your professional network graph",
    liveStats: "2nd Degree: +4,218",
    connectedStats: [
      { label: "Connections", value: "312" },
      { label: "2nd Degree", value: "4,218" },
      { label: "Mutual Intros", value: "7" },
    ],
    syncStages: ["Authenticating...", "Mapping network...", "Resolving paths...", "Building graph...", "Complete ✓"],
    unlockToast: "🔓 Network Graph + 2nd-degree paths unlocked",
    connectLabel: "Connect with LinkedIn",
    disconnectWarning: "Disconnect LinkedIn? This will pause network graph updates.",
  },
  {
    key: "notion", label: "Notion", icon: BookOpen, section: "recommended",
    categoryTag: "KNOWLEDGE BASE",
    glowColor: "shadow-[0_0_24px_rgba(255,255,255,0.12)]", glowHsl: "bg-white",
    description: "Import your investor tracker + research docs",
    liveStats: "24 pages synced · 18 investors imported",
    connectedStats: [
      { label: "Pages Synced", value: "24" },
      { label: "Investors Imported", value: "18" },
      { label: "Docs Indexed", value: "7" },
    ],
    syncStages: ["Authenticating...", "Scanning workspace...", "Indexing pages...", "Extracting investors...", "Complete ✓"],
    unlockToast: "🔓 Knowledge Base synced",
    connectLabel: "Connect with Notion",
    disconnectWarning: "Disconnect Notion? This will pause document syncing.",
  },
  // ── POWER SENSORS ──
  {
    key: "stripe", label: "Stripe", icon: CreditCard, section: "power",
    categoryTag: "TRACTION SIGNALS",
    glowColor: "shadow-[0_0_24px_rgba(139,92,246,0.3)]", glowHsl: "bg-violet-500",
    description: "Real-time MRR, churn, and growth signals",
    liveStats: "MRR: $12.4K · +18% MoM",
    connectedStats: [
      { label: "MRR", value: "$12.4K" },
      { label: "Growth", value: "+18%" },
      { label: "Churn", value: "2.1%" },
    ],
    syncStages: ["Authenticating...", "Fetching metrics...", "Calculating MRR...", "Analyzing trends...", "Complete ✓"],
    unlockToast: "🔓 Traction Metrics verified",
    connectLabel: "Connect with Stripe",
    disconnectWarning: "Disconnect Stripe? This will pause revenue metric updates.",
    note: "Read-only restricted key",
  },
  {
    key: "granola", label: "Granola", icon: FileText, section: "power",
    categoryTag: "MEETING INTELLIGENCE",
    glowColor: "shadow-[0_0_24px_rgba(234,179,8,0.3)]", glowHsl: "bg-yellow-500",
    description: "Turns investor meeting notes into action items",
    liveStats: "8 meetings processed · 3 follow-ups surfaced",
    connectedStats: [
      { label: "Meetings", value: "8" },
      { label: "Follow-ups", value: "3" },
      { label: "Actions", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning meetings...", "Extracting notes...", "Generating actions...", "Complete ✓"],
    unlockToast: "🔓 Meeting Intelligence active",
    connectLabel: "Connect with Granola",
    disconnectWarning: "Disconnect Granola? This will pause meeting note processing.",
  },
  {
    key: "hubspot", label: "HubSpot", icon: Contact, section: "power",
    categoryTag: "CRM PIPELINE",
    glowColor: "shadow-[0_0_24px_rgba(251,146,60,0.3)]", glowHsl: "bg-orange-500",
    description: "Import investor + customer pipeline",
    liveStats: "156 contacts synced · 23 deals imported",
    connectedStats: [
      { label: "Contacts Synced", value: "156" },
      { label: "Deals Imported", value: "23" },
      { label: "Pipeline Value", value: "$1.2M" },
    ],
    syncStages: ["Authenticating...", "Fetching contacts...", "Syncing deals...", "Building pipeline...", "Complete ✓"],
    unlockToast: "🔓 CRM Pipeline synced",
    connectLabel: "Connect with HubSpot",
    disconnectWarning: "Disconnect HubSpot? This will pause contact and deal syncing.",
  },
  {
    key: "attio", label: "Attio", icon: Layers, section: "power",
    categoryTag: "VC-NATIVE CRM",
    glowColor: "shadow-[0_0_24px_rgba(168,85,247,0.3)]", glowHsl: "bg-purple-500",
    description: "Sync your VC-native relationship CRM",
    liveStats: "89 people synced · 4 lists imported",
    connectedStats: [
      { label: "People Synced", value: "89" },
      { label: "Lists Imported", value: "4" },
      { label: "Relationships", value: "234" },
    ],
    syncStages: ["Authenticating...", "Fetching people...", "Syncing lists...", "Mapping relationships...", "Complete ✓"],
    unlockToast: "🔓 VC CRM synced",
    connectLabel: "Connect with Attio",
    disconnectWarning: "Disconnect Attio? This will pause relationship syncing.",
  },
  // ── SIGNAL SOURCES ──
  {
    key: "twitter", label: "X (Twitter)", icon: Twitter, section: "signal",
    categoryTag: "SOCIAL INTELLIGENCE",
    glowColor: "shadow-[0_0_24px_rgba(255,255,255,0.12)]", glowHsl: "bg-white",
    description: "Investor thesis signals + competitor moves",
    liveStats: "89 mutual follows · 7 investor signals this week",
    connectedStats: [
      { label: "Mutual Follows", value: "89" },
      { label: "Signals/Week", value: "7" },
      { label: "VCs Tracked", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning timeline...", "Analyzing sentiment...", "Mapping investors...", "Complete ✓"],
    unlockToast: "🔓 Social Intelligence unlocked",
    connectLabel: "Connect with X",
    disconnectWarning: "Disconnect X (Twitter)? This will pause social signal tracking.",
  },
];

const SECTIONS: { key: SensorSection; label: string; sub: string }[] = [
  { key: "recommended", label: "RECOMMENDED", sub: "Connect these first — highest impact on your matches" },
  { key: "power", label: "POWER SENSORS", sub: "For founders actively fundraising" },
  { key: "signal", label: "SIGNAL SOURCES", sub: "Social and market intelligence" },
];

async function simulateSync(key: SourceKey, onProgress: (p: number, m: string) => void) {
  const source = SOURCES.find(s => s.key === key)!;
  const stages = source.syncStages;
  const stops = [10, 60, 85, 99, 100];
  for (let i = 0; i < stages.length; i++) {
    onProgress(stops[i], stages[i]);
    await new Promise(r => setTimeout(r, i === stages.length - 1 ? 400 : 800));
  }
}

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

const TERMINAL_LOGS = [
  { time: "19:02", source: "GMAIL", msg: "4 new investor threads identified" },
  { time: "19:03", source: "CALENDAR", msg: "VC meeting detected → auto-tagged" },
  { time: "19:05", source: "STRIPE", msg: "MRR metrics recalculated → $12.4K" },
  { time: "19:07", source: "LINKEDIN", msg: "2nd-degree graph updated (+14 nodes)" },
  { time: "19:09", source: "NOTION", msg: "Investor tracker synced — 3 new entries" },
  { time: "19:11", source: "SYSTEM", msg: "Intelligence Engine score: 72%" },
];

interface SensorSuiteGridProps {
  /** Compact mode for settings dialog */
  compact?: boolean;
  /** Whether to show header KPI card */
  showHeader?: boolean;
  /** Whether to show live traffic terminal */
  showTerminal?: boolean;
}

export function SensorSuiteGrid({ compact = false, showHeader = true, showTerminal = true }: SensorSuiteGridProps) {
  const [connected, setConnected] = useState<Record<SourceKey, boolean>>(loadConnected);
  const [syncDetails, setSyncDetails] = useState(loadSyncDetails);
  const [syncStates, setSyncStates] = useState<Record<SourceKey, { syncing: boolean; progress: number; message: string }>>(() => {
    const init: any = {};
    ALL_KEYS.forEach(k => init[k] = { syncing: false, progress: 0, message: "" });
    return init;
  });
  const [activeConnect, setActiveConnect] = useState<SourceKey | null>(null);
  const [hoveredCard, setHoveredCard] = useState<SourceKey | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<SourceKey | null>(null);

  const connectedCount = ALL_KEYS.filter(k => connected[k]).length;

  const handleConnect = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Connecting..." } }));

    await new Promise(r => setTimeout(r, 1500));
    await simulateSync(key, (progress, message) => {
      setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });

    const now = new Date().toISOString();
    const nextConnected = { ...connected, [key]: true };
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };

    setConnected(nextConnected);
    setSyncDetails(nextDetails);
    saveConnected(nextConnected);
    saveSyncDetails(nextDetails);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);

    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ["#6366f1", "#34d399", "#818cf8"] });
    const source = SOURCES.find(s => s.key === key)!;
    toast.success("Intelligence Pipeline Established", { description: source.unlockToast });
  }, [activeConnect, connected, syncDetails]);

  const handleResync = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Re-syncing..." } }));
    await simulateSync(key, (progress, message) => {
      setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });
    const now = new Date().toISOString();
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };
    setSyncDetails(nextDetails);
    saveSyncDetails(nextDetails);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);
    toast.success(`${SOURCES.find(s => s.key === key)!.label} re-synced`);
  }, [activeConnect, syncDetails]);

  const confirmDisconnect = () => {
    if (!disconnectTarget) return;
    const nextConnected = { ...connected, [disconnectTarget]: false };
    setConnected(nextConnected);
    saveConnected(nextConnected);
    toast(`${SOURCES.find(s => s.key === disconnectTarget)!.label} disconnected`);
    setDisconnectTarget(null);
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

  function SensorCard({ source, index }: { source: SourceConfig; index: number }) {
    const Icon = source.icon;
    const isConnected = connected[source.key];
    const sync = syncStates[source.key];
    const isSyncing = sync.syncing;
    const isHovered = hoveredCard === source.key;

    if (compact) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`group rounded-xl border p-4 transition-all duration-200 ${
            isConnected ? "border-white/[0.08] bg-[#0A0A0A]" : "border-border bg-card hover:border-white/[0.1]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                  isConnected ? "bg-white/[0.06] border border-white/10" : "bg-muted border border-border"
                }`}>
                  <Icon className={`h-4 w-4 ${isConnected ? "text-white" : "text-muted-foreground"}`} />
                </div>
                {isConnected && (
                  <motion.div
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowHsl}`}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.4, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isConnected ? "text-white" : "text-foreground"}`}>{source.label}</span>
                  {isConnected && (
                    <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5">
                      <motion.div className="h-1.5 w-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
                    </div>
                  )}
                </div>
                <p className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${isConnected ? "text-white/20" : "text-muted-foreground/50"}`}>{source.categoryTag}</p>
                <p className={`text-[10px] mt-0.5 ${isConnected ? "text-white/30" : "text-muted-foreground"}`}>{source.description}</p>
                {isConnected && <p className="text-[10px] text-emerald-400/60 font-mono mt-1">{source.liveStats}</p>}
              </div>
            </div>
            <Button
              size="sm"
              className={`shrink-0 rounded-lg text-xs font-semibold h-8 px-3 ${
                isSyncing ? "bg-transparent border border-white/10"
                  : isConnected ? "bg-transparent border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/[0.06]"
                  : "bg-transparent border border-white/20 text-white/60 hover:bg-white/[0.06] hover:border-white/30"
              }`}
              onClick={() => isConnected ? setDisconnectTarget(source.key) : handleConnect(source.key)}
              disabled={isSyncing || (activeConnect !== null && activeConnect !== source.key)}
            >
              {isSyncing ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-3.5 w-3.5 border-2 border-white/10 border-t-white/60 rounded-full" />
              ) : isConnected ? "Disconnect" : source.connectLabel}
            </Button>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
        onMouseEnter={() => setHoveredCard(source.key)}
        onMouseLeave={() => setHoveredCard(null)}
        style={{
          transform: isHovered ? "perspective(800px) rotateX(-1.5deg) rotateY(1.5deg)" : "perspective(800px) rotateX(0) rotateY(0)",
          transition: "transform 0.3s ease",
          boxShadow: isConnected ? `0 0 28px ${source.glowColor.match(/rgba\([^)]+\)/)?.[0] || "transparent"}` : "none",
        }}
        className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${
          isConnected
            ? "border-white/[0.12] bg-[#0A0A0A]/95 backdrop-blur-xl"
            : "border-white/[0.06] bg-[#0A0A0A]/80 hover:border-white/[0.12]"
        }`}
      >
        {isConnected && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
        )}

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                  isConnected ? "border-white/10 bg-white/[0.06]" : "border-white/[0.06] bg-white/[0.03]"
                }`}>
                  {isConnected ? <Check className="h-4 w-4 text-emerald-400" /> : <Icon className="h-4 w-4 text-white/40" />}
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
                <p className="text-[10px] text-white/25 font-mono uppercase tracking-wider mt-0.5">{source.categoryTag}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isConnected && !isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
                  <motion.div className="h-1.5 w-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                  <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
                </div>
              )}
              {!isConnected && !isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] px-2.5 py-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="text-[10px] font-medium text-white/25 uppercase tracking-wider">Not Connected</span>
                </div>
              )}
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
          </div>

          <p className="text-[11px] text-white/30 mb-4">{source.description}</p>

          {isConnected && !isSyncing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <SparklinePulse />
                <span className="text-[10px] text-emerald-400/80 font-mono">{source.liveStats}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {source.connectedStats.map(stat => (
                  <div key={stat.label} className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5">
                    <p className="text-lg font-bold text-white font-mono tracking-tight">{stat.value}</p>
                    <p className="text-[9px] text-white/25 uppercase tracking-wider font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
              {syncDetails[source.key]?.lastSynced && (
                <p className="text-[10px] text-white/20 font-mono mt-2">Last synced: {formatLastSynced(syncDetails[source.key].lastSynced)}</p>
              )}
            </motion.div>
          )}

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

          <div className="flex items-center justify-between">
            {!isConnected && !isSyncing && (
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  onClick={() => handleConnect(source.key)}
                  disabled={activeConnect !== null}
                  className="rounded-lg text-xs font-semibold h-9 px-5 bg-transparent border border-white/20 text-white/70 hover:bg-white/[0.06] hover:border-white/30 hover:text-white transition-all"
                >
                  {source.connectLabel}
                </Button>
                {source.note && <p className="text-[10px] text-white/20 font-mono">{source.note}</p>}
              </div>
            )}
            {isConnected && !isSyncing && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04]" onClick={() => handleResync(source.key)} disabled={activeConnect !== null}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-sync
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/[0.06]" onClick={() => setDisconnectTarget(source.key)}>
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

        {isSyncing && (
          <div className="h-[2px] bg-white/[0.04]">
            <motion.div className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-500" animate={{ width: `${sync.progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* Disconnect Modal */}
      <AnimatePresence>
        {disconnectTarget && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setDisconnectTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="w-full max-w-sm rounded-2xl bg-[#0A0A0A] border border-white/[0.08] shadow-2xl shadow-black/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">Confirm Disconnect</h3>
                </div>
                <p className="text-sm text-white/40 mb-6">
                  {SOURCES.find(s => s.key === disconnectTarget)?.disconnectWarning}
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-9 px-4 text-white/50 hover:text-white hover:bg-white/[0.06]" onClick={() => setDisconnectTarget(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="rounded-lg text-xs h-9 px-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20" onClick={confirmDisconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Header KPI */}
        {showHeader && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Database className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{connectedCount}/9 sensors active</h2>
                  <p className="text-xs text-white/30">More connections = richer intelligence</p>
                </div>
              </div>
              {connectedCount >= 3 && (
                <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-emerald-400" /><span className="text-xs font-semibold text-emerald-400">Full Intelligence</span></div>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                animate={{ width: `${(connectedCount / 9) * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p className="text-[11px] text-white/25 font-mono">
              {connectedCount} connected · Investor matches improve with each sensor
            </p>
          </motion.div>
        )}

        {/* Empty State */}
        {connectedCount === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-dashed border-white/[0.1] bg-[#0A0A0A]/60 p-12 flex flex-col items-center justify-center text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
              <Sparkles className="h-7 w-7 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Your Intelligence Engine is waiting</h3>
            <p className="text-sm text-white/30 max-w-xs mb-6">
              Connect Gmail or Notion to get your first investor recommendations
            </p>
            <Button
              size="sm"
              onClick={() => handleConnect("google")}
              disabled={activeConnect !== null}
              className="rounded-lg text-sm font-semibold h-10 px-6 bg-indigo-500 text-white hover:bg-indigo-600 transition-all"
            >
              Connect Gmail →
            </Button>
          </motion.div>
        )}

        {/* Sensor Sections */}
        {SECTIONS.map((section, si) => {
          const sectionSources = SOURCES.filter(s => s.section === section.key);
          return (
            <div key={section.key}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + si * 0.1 }}
                className="mb-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-white/20" />
                  <h2 className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/30 font-semibold">{section.label}</h2>
                </div>
                <p className="text-[11px] text-white/20 ml-5.5">{section.sub}</p>
              </motion.div>
              <div className={compact ? "space-y-2.5" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                {sectionSources.map((source, i) => (
                  <SensorCard key={source.key} source={source} index={si * 3 + i} />
                ))}
              </div>

              {section.key === "signal" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-3 rounded-2xl border border-dashed border-white/[0.06] bg-transparent p-5 flex items-center justify-center"
                >
                  <p className="text-[12px] text-white/20 font-mono">More integrations coming: Mercury · Ashby · Salesforce</p>
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Live Traffic Terminal */}
        {showTerminal && connectedCount >= 1 && (
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

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
          <Lock className="h-3.5 w-3.5 text-white/20" />
          <p className="text-[11px] text-white/25">🔒 Read-only access · AES-256 encrypted · Never shared</p>
        </motion.div>
      </div>
    </div>
  );
}
