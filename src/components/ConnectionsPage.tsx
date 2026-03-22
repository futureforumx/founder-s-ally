import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Linkedin, Twitter, Calendar, Zap, CheckCircle2, Lock,
  Shield, RefreshCw, Clock, ArrowRight, Sparkles, AlertCircle,
  Database, Users, Network, TrendingUp, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ── Types ──
type SourceKey = "gmail" | "linkedin" | "twitter" | "calendar" | "angellist";

interface SourceSyncState {
  connected: boolean;
  syncing: boolean;
  progress: number;
  statusMessage: string;
  lastSynced: string | null;
  stats: { label: string; value: string }[];
}

// ── Persistence ──
const STORAGE_KEY = "community-connections-status";
const SYNC_DETAIL_KEY = "connections-sync-detail";

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

const ALL_KEYS: SourceKey[] = ["gmail", "linkedin", "twitter", "calendar", "angellist"];

// ── Source Configs ──
const SOURCES: {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
  connectedStats: { label: string; value: string }[];
  syncStages: string[];
  unlockMessage: string;
}[] = [
  {
    key: "gmail",
    label: "Gmail",
    icon: Mail,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "Email threads, VC contacts, and warm intro paths",
    connectedStats: [
      { label: "Emails Scanned", value: "2,340" },
      { label: "VC Contacts", value: "47" },
      { label: "Intro Paths", value: "12" },
    ],
    syncStages: ["Authenticating...", "Scanning inbox...", "Extracting VC contacts...", "Building intro graph...", "Complete ✓"],
    unlockMessage: "Gmail sync complete — 47 VC contacts found",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    description: "Professional network, 1st & 2nd degree investor paths",
    connectedStats: [
      { label: "Connections", value: "312" },
      { label: "Investor Paths", value: "18" },
      { label: "Mutual Intros", value: "7" },
    ],
    syncStages: ["Authenticating...", "Mapping connections...", "Analyzing degrees...", "Scoring paths...", "Complete ✓"],
    unlockMessage: "LinkedIn sync complete — 18 investor paths discovered",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: Twitter,
    color: "text-foreground",
    bgColor: "bg-foreground/5",
    description: "Social sentiment, VC mentions, and engagement signals",
    connectedStats: [
      { label: "Interactions", value: "1,280" },
      { label: "VCs Engaged", value: "9" },
      { label: "Sentiment", value: "Positive" },
    ],
    syncStages: ["Authenticating...", "Scanning timeline...", "Analyzing mentions...", "Scoring sentiment...", "Complete ✓"],
    unlockMessage: "X sync complete — 9 engaged VC accounts tracked",
  },
  {
    key: "calendar",
    label: "Google Calendar",
    icon: Calendar,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Past VC meetings, intro calls, and recurring contacts",
    connectedStats: [
      { label: "VC Meetings", value: "14" },
      { label: "Recurring", value: "6" },
      { label: "Last Meeting", value: "3d ago" },
    ],
    syncStages: ["Authenticating...", "Scanning events...", "Detecting VC meetings...", "Mapping contacts...", "Complete ✓"],
    unlockMessage: "Calendar sync complete — 14 VC meetings found",
  },
  {
    key: "angellist",
    label: "AngelList",
    icon: Zap,
    color: "text-foreground",
    bgColor: "bg-foreground/5",
    description: "Portfolio follows, applications, and investor activity",
    connectedStats: [
      { label: "Applications", value: "8" },
      { label: "Tracked VCs", value: "23" },
      { label: "Follows", value: "41" },
    ],
    syncStages: ["Authenticating...", "Syncing portfolio...", "Scanning applications...", "Mapping activity...", "Complete ✓"],
    unlockMessage: "AngelList sync complete — 23 investors tracked",
  },
];

// ── Sync simulation ──
async function simulateSync(
  key: SourceKey,
  onProgress: (progress: number, message: string) => void
): Promise<void> {
  const source = SOURCES.find((s) => s.key === key)!;
  const stages = source.syncStages;
  const progressStops = [10, 45, 70, 92, 100];
  for (let i = 0; i < stages.length; i++) {
    onProgress(progressStops[i], stages[i]);
    await new Promise((r) => setTimeout(r, i === stages.length - 1 ? 400 : 800 + Math.random() * 400));
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

  const connectedCount = ALL_KEYS.filter((k) => connected[k]).length;

  const handleConnect = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);

    // Start sync
    setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Connecting..." } }));

    await simulateSync(key, (progress, message) => {
      setSyncStates((prev) => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });

    // Complete
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
    toast.success(source.unlockMessage);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">Sync your data sources to power network intelligence, warm intros, and founder experiences</p>
      </div>

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
            <motion.div
              className="h-full bg-accent rounded-full"
              animate={{ width: `${(connectedCount / 5) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
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
          {SOURCES.map((source) => {
            const Icon = source.icon;
            const isConnected = connected[source.key];
            const sync = syncStates[source.key];
            const isSyncing = sync.syncing;
            const detail = syncDetails[source.key];

            return (
              <motion.div
                key={source.key}
                layout
                className={`rounded-xl border transition-colors ${
                  isSyncing
                    ? "border-primary/30 bg-primary/5"
                    : isConnected
                    ? "border-accent/20 bg-card"
                    : "border-border bg-card hover:bg-secondary/20"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                        isConnected ? "bg-accent/10" : source.bgColor
                      }`}>
                        {isConnected ? (
                          <CheckCircle2 className="h-5 w-5 text-accent" />
                        ) : (
                          <Icon className={`h-5 w-5 ${source.color}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{source.label}</span>
                          {isConnected && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                            </span>
                          )}
                          {isConnected && (
                            <Badge variant="outline" className="text-[9px] text-accent border-accent/30 uppercase font-bold">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{source.description}</p>
                        {isConnected && detail.lastSynced && (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                            <span className="text-[10px] text-muted-foreground/60">Last synced {formatLastSynced(detail.lastSynced)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isConnected && !isSyncing && (
                        <Button
                          size="sm"
                          className="rounded-lg text-xs font-semibold h-8 px-4"
                          onClick={() => handleConnect(source.key)}
                          disabled={activeConnect !== null}
                        >
                          Connect
                        </Button>
                      )}
                      {isConnected && !isSyncing && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-xs h-8 px-2.5 text-muted-foreground"
                            onClick={() => handleResync(source.key)}
                            disabled={activeConnect !== null}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Sync
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-xs h-8 px-2.5 text-destructive hover:text-destructive"
                            onClick={() => handleDisconnect(source.key)}
                          >
                            Disconnect
                          </Button>
                        </>
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
                        <div className="mt-3 ml-[52px] space-y-1.5">
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

                  {/* Connected Stats */}
                  {isConnected && !isSyncing && (
                    <div className="mt-3 ml-[52px] flex items-center gap-4">
                      {source.connectedStats.map((stat) => (
                        <div key={stat.label} className="text-center">
                          <p className="text-sm font-bold text-foreground">{stat.value}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

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
  );
}
