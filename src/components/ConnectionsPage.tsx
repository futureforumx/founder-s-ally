import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Linkedin, Twitter, Calendar, Zap, CheckCircle2, Lock,
  Shield, RefreshCw, Clock, ArrowRight, Sparkles, AlertCircle,
  Database, Users, Network, TrendingUp, BarChart3, X as XIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ── Types ──
type SourceKey = "gmail" | "linkedin" | "twitter" | "angellist";

// ── Persistence ──
const STORAGE_KEY = "community-connections-status";
const SYNC_DETAIL_KEY = "connections-sync-detail";
const MODAL_DISMISSED_KEY = "connections-modal-dismissed";

const ALL_KEYS: SourceKey[] = ["gmail", "linkedin", "twitter", "calendar", "angellist"];

function loadConnected(): Record<SourceKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { gmail: false, linkedin: false, twitter: false, calendar: false, angellist: false };
}

function saveConnected(s: Record<SourceKey, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function loadSyncDetails(): Record<SourceKey, { lastSynced: string | null }> {
  try {
    const raw = localStorage.getItem(SYNC_DETAIL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach((k) => (def[k] = { lastSynced: null }));
  return def;
}

function saveSyncDetails(d: Record<SourceKey, { lastSynced: string | null }>) {
  localStorage.setItem(SYNC_DETAIL_KEY, JSON.stringify(d));
}

// ── Source Configs ──
const SOURCES: {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
  statChip: string;
  connectedStats: { label: string; value: string }[];
  syncStages: string[];
  unlockToast: string;
}[] = [
  {
    key: "gmail", label: "Gmail", icon: Mail,
    color: "text-red-500", bgColor: "bg-red-500/10",
    description: "Scan email threads for warm intro paths and VC contact graph",
    statChip: "2,340 emails scanned · 47 VC contacts found",
    connectedStats: [
      { label: "Emails Scanned", value: "2,340" },
      { label: "VC Contacts", value: "47" },
      { label: "Intro Paths", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning data...", "Extracting contacts...", "Building relationship graph...", "Complete ✓"],
    unlockToast: "🔓 Warm Intro Paths unlocked",
  },
  {
    key: "linkedin", label: "LinkedIn", icon: Linkedin,
    color: "text-blue-600", bgColor: "bg-blue-600/10",
    description: "Map your professional network to discover 1st & 2nd degree paths to investors",
    statChip: "312 connections mapped · 18 investor paths",
    connectedStats: [
      { label: "Connections", value: "312" },
      { label: "Investor Paths", value: "18" },
      { label: "Mutual Intros", value: "7" },
    ],
    syncStages: ["Authenticating...", "Scanning data...", "Extracting contacts...", "Building relationship graph...", "Complete ✓"],
    unlockToast: "🔓 Network Graph + 2nd-degree paths unlocked",
  },
  {
    key: "twitter", label: "X (Twitter)", icon: Twitter,
    color: "text-foreground", bgColor: "bg-foreground/5",
    description: "Track social sentiment, mentions, and engagement with investor accounts",
    statChip: "89 mutual follows · 12 investor accounts tracked",
    connectedStats: [
      { label: "Mutual Follows", value: "89" },
      { label: "VCs Tracked", value: "12" },
      { label: "Sentiment", value: "Positive" },
    ],
    syncStages: ["Authenticating...", "Scanning data...", "Extracting contacts...", "Building relationship graph...", "Complete ✓"],
    unlockToast: "🔓 Social Sentiment unlocked",
  },
  {
    key: "calendar", label: "Google Calendar", icon: Calendar,
    color: "text-blue-500", bgColor: "bg-blue-500/10",
    description: "Detect past VC meetings, intro calls, and recurring investor contacts",
    statChip: "24 past meetings detected · 6 VC contacts",
    connectedStats: [
      { label: "VC Meetings", value: "24" },
      { label: "Recurring", value: "6" },
      { label: "Last Meeting", value: "3d ago" },
    ],
    syncStages: ["Authenticating...", "Scanning data...", "Extracting contacts...", "Building relationship graph...", "Complete ✓"],
    unlockToast: "🔓 Meeting History unlocked",
  },
  {
    key: "angellist", label: "AngelList", icon: Zap,
    color: "text-foreground", bgColor: "bg-foreground/5",
    description: "Sync portfolio follows, past applications, and investor activity",
    statChip: "3 applications synced · 15 investor follows",
    connectedStats: [
      { label: "Applications", value: "3" },
      { label: "Investor Follows", value: "15" },
      { label: "Tracked VCs", value: "23" },
    ],
    syncStages: ["Authenticating...", "Scanning data...", "Extracting contacts...", "Building relationship graph...", "Complete ✓"],
    unlockToast: "🔓 Portfolio Intelligence unlocked",
  },
];

const INTRO_PATHS = [
  { chain: "You → David Park → Roelof Botha at Sequoia Capital", strength: 82 },
  { chain: "You → Rina Patel → Sarah Guo at Conviction", strength: 74 },
  { chain: "You → James Wu → Benchmark Capital (Bill Gurley)", strength: 61 },
];

// ── Sync simulation ──
async function simulateSync(
  key: SourceKey,
  onProgress: (progress: number, message: string) => void
): Promise<void> {
  const source = SOURCES.find((s) => s.key === key)!;
  const stages = source.syncStages;
  const progressStops = [10, 60, 85, 99, 100];
  for (let i = 0; i < stages.length; i++) {
    onProgress(progressStops[i], stages[i]);
    await new Promise((r) => setTimeout(r, i === stages.length - 1 ? 400 : 800));
  }
}

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

  // When 3+ sources connected inside modal, auto-enable CTA
  useEffect(() => {
    if (connectedCount >= 3) {
      // toast for full analytics once
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

    // 1.5s OAuth simulation
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

    const source = SOURCES.find((s) => s.key === key)!;
    toast.success(source.unlockToast);
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
    toast.success(`${SOURCES.find((s) => s.key === key)!.label} re-synced successfully`);
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

  // ── Source Card (shared between modal and page) ──
  function SourceCard({ source, inModal }: { source: typeof SOURCES[0]; inModal?: boolean }) {
    const Icon = source.icon;
    const isConnected = connected[source.key];
    const sync = syncStates[source.key];
    const isSyncing = sync.syncing;
    const detail = syncDetails[source.key];

    return (
      <motion.div
        layout
        className={`rounded-xl border transition-all duration-200 ${
          isSyncing
            ? "border-primary/30 bg-primary/5"
            : isConnected
            ? "border-accent/20 bg-[hsl(142,76%,97%)]"
            : "border-border bg-card hover:shadow-sm hover:border-muted-foreground/20"
        }`}
      >
        <div className={inModal ? "p-3" : "p-4"}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex ${inModal ? "h-9 w-9" : "h-10 w-10"} items-center justify-center rounded-xl shrink-0 ${
                isConnected ? "bg-accent/10" : source.bgColor
              }`}>
                {isConnected ? (
                  <CheckCircle2 className={`${inModal ? "h-4 w-4" : "h-5 w-5"} text-accent`} />
                ) : (
                  <Icon className={`${inModal ? "h-4 w-4" : "h-5 w-5"} ${source.color}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`${inModal ? "text-[13px]" : "text-sm"} font-bold text-foreground`}>{source.label}</span>
                  {isConnected && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{source.description}</p>
                {isConnected && !isSyncing && inModal && (
                  <p className="text-[10px] text-accent font-medium mt-1">{source.statChip}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isConnected && !isSyncing && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg text-xs font-semibold h-8 px-4 border-foreground/20 text-foreground hover:bg-foreground hover:text-background"
                  onClick={() => handleConnect(source.key)}
                  disabled={activeConnect !== null}
                >
                  Connect
                </Button>
              )}
              {isConnected && !isSyncing && !inModal && (
                <>
                  <Button
                    size="sm" variant="ghost"
                    className="rounded-lg text-xs h-8 px-2.5 text-muted-foreground"
                    onClick={() => handleResync(source.key)}
                    disabled={activeConnect !== null}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Sync
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="rounded-lg text-xs h-8 px-2.5 text-destructive hover:text-destructive"
                    onClick={() => handleDisconnect(source.key)}
                  >
                    Disconnect
                  </Button>
                </>
              )}
              {isConnected && !isSyncing && inModal && (
                <CheckCircle2 className="h-5 w-5 text-accent" />
              )}
              {isSyncing && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="h-5 w-5 border-2 border-muted-foreground/20 border-t-primary rounded-full"
                />
              )}
            </div>
          </div>

          {/* Sync Progress */}
          <AnimatePresence>
            {isSyncing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 ml-12 space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full bg-accent rounded-full"
                      animate={{ width: `${sync.progress}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium">{sync.message}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{sync.progress}%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Connected Stats (page only) */}
          {isConnected && !isSyncing && !inModal && (
            <div className="mt-3 ml-[52px] flex items-center gap-4">
              {source.connectedStats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-sm font-bold text-foreground">{stat.value}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                </div>
              ))}
              {syncDetails[source.key]?.lastSynced && (
                <div className="flex items-center gap-1 ml-auto">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground/60">
                    Last synced {formatLastSynced(syncDetails[source.key].lastSynced)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* ═══ CONNECT YOUR SOURCES MODAL ═══ */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-background/40 backdrop-blur-sm"
              onClick={dismissModal}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="w-full max-w-[480px] rounded-2xl bg-card shadow-xl border border-border overflow-hidden">
                {/* Modal Header */}
                <div className="p-6 pb-4 flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted shrink-0">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-foreground">Connect Your Sources</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Link accounts to power community intelligence</p>
                  </div>
                  <button
                    onClick={dismissModal}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Source Cards */}
                <div className="px-6 space-y-2 max-h-[50vh] overflow-y-auto">
                  {SOURCES.map((source) => (
                    <SourceCard key={source.key} source={source} inModal />
                  ))}
                </div>

                {/* Progressive Unlock Gate */}
                <div className="px-6 pt-4 pb-2">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {ALL_KEYS.map((k) => (
                      <div
                        key={k}
                        className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                          connected[k] ? "bg-accent" : "bg-muted-foreground/20"
                        }`}
                      />
                    ))}
                  </div>
                  {remaining > 0 ? (
                    <p className="text-xs text-muted-foreground text-center">
                      Connect {remaining} more source{remaining !== 1 ? "s" : ""} to unlock full analytics
                    </p>
                  ) : (
                    <p className="text-xs text-accent font-medium text-center">
                      ✓ Full analytics unlocked
                    </p>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-6 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Read-only access · Data never shared</span>
                  </div>
                  {connectedCount >= 3 ? (
                    <Button
                      size="sm"
                      className="rounded-lg text-xs font-semibold h-9 px-5 bg-foreground text-background hover:bg-foreground/90"
                      onClick={dismissModal}
                    >
                      View My Network <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  ) : (
                    <button
                      onClick={dismissModal}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip for now
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ PAGE CONTENT ═══ */}
      <div className={showModal ? "pointer-events-none select-none" : ""}>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Connections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Network intelligence, warm intros, and founder experiences
            </p>
          </div>

          {/* ── Amber Banner (0 sources, skipped) ── */}
          {connectedCount === 0 && !showModal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                  Connect Gmail to unlock warm intro paths
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-xs h-8 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                onClick={() => setShowModal(true)}
              >
                Connect →
              </Button>
            </motion.div>
          )}

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Database className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Sources</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-foreground">{connectedCount}</span>
                <span className="text-sm text-muted-foreground">/5</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div className="h-full bg-accent rounded-full" animate={{ width: `${(connectedCount / 5) * 100}%` }} transition={{ duration: 0.5 }} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <Users className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">VC Contacts</span>
              </div>
              <span className="text-3xl font-black text-foreground">{connected.gmail ? "47" : "—"}</span>
              <p className="text-[10px] text-muted-foreground mt-1">Extracted from email + LinkedIn</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <Network className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Intro Paths</span>
              </div>
              <span className="text-3xl font-black text-foreground">{connected.linkedin ? "18" : "—"}</span>
              <p className="text-[10px] text-muted-foreground mt-1">1st & 2nd degree warm paths</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <TrendingUp className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Intelligence</span>
              </div>
              <span className="text-3xl font-black text-foreground">{connectedCount >= 3 ? "Active" : "Limited"}</span>
              <p className="text-[10px] text-muted-foreground mt-1">{connectedCount >= 3 ? "Full analytics unlocked" : "Connect 3+ for full access"}</p>
            </div>
          </div>

          {/* Source Cards */}
          <div>
            <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Data Sources</h2>
            <div className="space-y-2.5">
              {SOURCES.map((source) => (
                <SourceCard key={source.key} source={source} />
              ))}
            </div>
          </div>

          {/* ═══ Post-Modal Dashboard Panels ═══ */}
          {connectedCount >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            >
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

              {/* Network Graph Preview */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Network className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-bold text-foreground">Network Graph</h3>
                </div>
                <div className="relative h-48 flex items-center justify-center">
                  {/* Simple node map */}
                  <svg viewBox="0 0 200 200" className="w-full h-full max-w-[200px]">
                    {/* Lines to 1st degree */}
                    {[45, 105, 165, 255, 315].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 55;
                      const y = 100 + Math.sin(rad) * 55;
                      return <line key={`l1-${i}`} x1="100" y1="100" x2={x} y2={y} stroke="hsl(var(--accent))" strokeWidth="1.5" opacity="0.4" />;
                    })}
                    {/* Lines to 2nd degree */}
                    {[20, 70, 130, 200, 240, 290, 340].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const mid = 55;
                      const outer = 85;
                      const mx = 100 + Math.cos(rad) * mid;
                      const my = 100 + Math.sin(rad) * mid;
                      const ox = 100 + Math.cos(rad) * outer;
                      const oy = 100 + Math.sin(rad) * outer;
                      return <line key={`l2-${i}`} x1={mx} y1={my} x2={ox} y2={oy} stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.2" />;
                    })}
                    {/* Center node */}
                    <circle cx="100" cy="100" r="10" fill="hsl(var(--accent))" />
                    <text x="100" y="103" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">You</text>
                    {/* 1st degree nodes */}
                    {[45, 105, 165, 255, 315].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 55;
                      const y = 100 + Math.sin(rad) * 55;
                      return <circle key={`n1-${i}`} cx={x} cy={y} r="6" fill="hsl(var(--foreground))" opacity="0.7" />;
                    })}
                    {/* 2nd degree nodes */}
                    {[20, 70, 130, 200, 240, 290, 340].map((angle, i) => {
                      const rad = (angle * Math.PI) / 180;
                      const x = 100 + Math.cos(rad) * 85;
                      const y = 100 + Math.sin(rad) * 85;
                      return <circle key={`n2-${i}`} cx={x} cy={y} r="4" fill="hsl(var(--muted-foreground))" opacity="0.3" />;
                    })}
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-foreground/70" />
                    <span className="text-[10px] text-muted-foreground">1st degree</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="text-[10px] text-muted-foreground">2nd degree</span>
                  </div>
                </div>
              </div>

              {/* Sync Status Panel */}
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
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${source.color}`} />
                          <span className="text-xs font-medium text-foreground">{source.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {formatLastSynced(syncDetails[source.key]?.lastSynced)}
                          </span>
                          <Button
                            size="sm" variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleResync(source.key)}
                            disabled={activeConnect !== null}
                          >
                            <RefreshCw className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Total contacts scanned</span>
                    <span className="font-mono text-foreground font-semibold">2,764</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">VC contacts found</span>
                    <span className="font-mono text-foreground font-semibold">47</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Intro paths mapped</span>
                    <span className="font-mono text-foreground font-semibold">18</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Partial unlock: locked panels */}
          {connectedCount >= 1 && connectedCount < 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-card/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">Connect Gmail to unlock</p>
                </div>
                <div className="opacity-30">
                  <h3 className="text-sm font-bold text-foreground mb-3">Warm Intro Paths</h3>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-muted/40" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-card/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">Connect LinkedIn to unlock</p>
                </div>
                <div className="opacity-30">
                  <h3 className="text-sm font-bold text-foreground mb-3">Network Graph</h3>
                  <div className="h-40 rounded-lg bg-muted/40" />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-card/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground font-medium">Connect 3+ sources to unlock</p>
                </div>
                <div className="opacity-30">
                  <h3 className="text-sm font-bold text-foreground mb-3">Sync Status</h3>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-8 rounded-lg bg-muted/40" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between rounded-xl bg-muted/20 border border-border p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">Your data is secure</p>
                <p className="text-[10px] text-muted-foreground">Read-only access · AES-256 encrypted · Never shared with third parties</p>
              </div>
            </div>
            {connectedCount >= 3 && (
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-semibold text-accent">Full Intelligence Active</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
