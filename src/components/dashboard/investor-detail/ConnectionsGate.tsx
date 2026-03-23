import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Lock, X, CheckCircle2, Mail, Linkedin, Twitter,
  ArrowRight, Sparkles, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ── Types ──
type SourceKey = "google" | "linkedin" | "twitter" | "angellist";

interface SourceStatus {
  state: "idle" | "authenticating" | "syncing" | "complete";
  progress: number;
  statusMessage: string;
  stats: string | null;
}

interface ConnStatus {
  google: SourceStatus;
  linkedin: SourceStatus;
  twitter: SourceStatus;
  angellist: SourceStatus;
}

// ── Persistence ──
const STORAGE_KEY = "community-connections-status";
const DETAIL_KEY = "community-connections-detail";

function loadCompletedSources(): Set<SourceKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      // migrate old "gmail" key
      if ("gmail" in obj && !("google" in obj)) obj.google = obj.gmail;
      const keys: SourceKey[] = ["google", "linkedin", "twitter", "angellist"];
      return new Set(keys.filter((k) => obj[k] === true));
    }
  } catch {}
  return new Set();
}

function saveCompletedSources(completed: Set<SourceKey>) {
  const obj: Record<string, boolean> = {};
  (["google", "linkedin", "twitter", "angellist"] as SourceKey[]).forEach(
    (k) => (obj[k] = completed.has(k))
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// ── Source Definitions ──
const SOURCES: {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  description: string;
  stats: string;
  unlockMessage: string;
  sensorType: "identity" | "pipeline" | "ingestor";
  typeLabel: string;
  glowBg: string;
  liveMsg: string;
}[] = [
  {
    key: "google", label: "Google Workspace", icon: Mail,
    description: "Gmail + Calendar — unified workspace sync for intro paths",
    stats: "2,340 emails scanned · 47 VC contacts found",
    unlockMessage: "🔓 Warm Intro Paths unlocked",
    sensorType: "pipeline", typeLabel: "Intelligence Pipeline",
    glowBg: "bg-indigo-500", liveMsg: "142 threads analyzed",
  },
  {
    key: "linkedin", label: "LinkedIn", icon: Linkedin,
    description: "Map your professional network to discover 1st & 2nd degree paths",
    stats: "312 connections mapped · 18 investor paths",
    unlockMessage: "🔓 Network Graph + 2nd-degree paths unlocked",
    sensorType: "identity", typeLabel: "Professional Identity",
    glowBg: "bg-blue-500", liveMsg: "2nd Degree: +4,218",
  },
  {
    key: "twitter", label: "X (Twitter)", icon: Twitter,
    description: "Track social sentiment, mentions, and investor engagement",
    stats: "1,280 interactions analyzed · 9 VCs engaged",
    unlockMessage: "🔓 Social Sentiment Analysis unlocked",
    sensorType: "pipeline", typeLabel: "Intelligence Pipeline",
    glowBg: "bg-white", liveMsg: "89 mutual follows",
  },
  {
    key: "angellist", label: "AngelList", icon: Zap,
    description: "Import investors via CSV for AI enrichment",
    stats: "47 investors imported · 23 enriched",
    unlockMessage: "🔓 Portfolio Intelligence unlocked",
    sensorType: "ingestor", typeLabel: "Portfolio Discovery",
    glowBg: "bg-amber-400", liveMsg: "47 investors imported",
  },
];

const SYNC_STAGES: { message: string; targetProgress: number; duration: number }[] = [
  { message: "Authenticating...", targetProgress: 10, duration: 600 },
  { message: "Scanning data...", targetProgress: 60, duration: 1200 },
  { message: "Extracting contacts...", targetProgress: 85, duration: 1000 },
  { message: "Building relationship graph...", targetProgress: 99, duration: 800 },
  { message: "Complete ✓", targetProgress: 100, duration: 400 },
];

function makeIdleStatus(): SourceStatus {
  return { state: "idle", progress: 0, statusMessage: "", stats: null };
}

function makeCompleteStatus(stats: string): SourceStatus {
  return { state: "complete", progress: 100, statusMessage: "Complete ✓", stats };
}

// ── Component ──
interface ConnectionsGateProps {
  children: React.ReactNode;
}

export function ConnectionsGate({ children }: ConnectionsGateProps) {
  const completedRef = useRef(loadCompletedSources());
  const [statuses, setStatuses] = useState<ConnStatus>(() => {
    const completed = completedRef.current;
    const init: any = {};
    for (const s of SOURCES) {
      init[s.key] = completed.has(s.key) ? makeCompleteStatus(s.stats) : makeIdleStatus();
    }
    return init as ConnStatus;
  });
  const [showModal, setShowModal] = useState(() => completedRef.current.size === 0);
  const [connectingKey, setConnectingKey] = useState<SourceKey | null>(null);

  const completedCount = SOURCES.filter((s) => statuses[s.key].state === "complete").length;
  const isUnlocked = completedCount >= 1;

  // Check if 3+ sources just completed to fire full analytics toast
  const prevCompletedCountRef = useRef(completedCount);
  useEffect(() => {
    if (completedCount >= 3 && prevCompletedCountRef.current < 3) {
      setTimeout(() => {
        toast("🔓 Full analytics dashboard unlocked", {
          description: "All community intelligence features are now active",
        });
      }, 500);
    }
    prevCompletedCountRef.current = completedCount;
  }, [completedCount]);

  const handleConnect = useCallback(async (key: SourceKey) => {
    if (connectingKey) return;
    setConnectingKey(key);

    const source = SOURCES.find((s) => s.key === key)!;

    // Step 1: Auth simulation
    setStatuses((prev) => ({
      ...prev,
      [key]: { state: "authenticating", progress: 0, statusMessage: "Connecting...", stats: null },
    }));
    await new Promise((r) => setTimeout(r, 1500));

    // Step 2: Sync progress stages
    setStatuses((prev) => ({
      ...prev,
      [key]: { ...prev[key], state: "syncing" },
    }));

    for (const stage of SYNC_STAGES) {
      setStatuses((prev) => ({
        ...prev,
        [key]: { ...prev[key], statusMessage: stage.message, progress: stage.targetProgress },
      }));
      await new Promise((r) => setTimeout(r, stage.duration));
    }

    // Step 3: Complete
    setStatuses((prev) => ({
      ...prev,
      [key]: makeCompleteStatus(source.stats),
    }));

    // Persist
    completedRef.current.add(key);
    saveCompletedSources(completedRef.current);

    setConnectingKey(null);

    // Step 4: Unlock toast
    toast(source.unlockMessage, {
      description: source.stats,
    });
  }, [connectingKey]);

  const handleSkip = () => setShowModal(false);

  // If unlocked and modal is closed, render children directly
  if (isUnlocked && !showModal) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Blurred preview behind */}
      <div className="relative">
        <div className="pointer-events-none select-none filter blur-[6px] opacity-40 overflow-hidden max-h-[600px]">
          {children}
        </div>

        {/* Lock overlay */}
        {!showModal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center max-w-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-4">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1.5">Connect Your Network</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Link at least one data source to unlock warm intros, community intelligence, and social sentiment.
              </p>
              <Button onClick={() => setShowModal(true)} className="rounded-xl px-6 font-semibold">
                <Sparkles className="h-4 w-4 mr-2" />
                Link Accounts
              </Button>
            </motion.div>
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 rounded-2xl overflow-hidden border-white/[0.08] bg-[#0A0A0A] shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <Shield className="h-5 w-5 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-white leading-tight">Sensor Suite</h3>
                <p className="text-sm text-white/30 mt-0.5">Link accounts to power intelligence engine</p>
              </div>
            </div>
          </div>

          {/* Source Cards */}
          <div className="p-4 space-y-2 max-h-[420px] overflow-y-auto">
            {SOURCES.map((source) => {
              const Icon = source.icon;
              const status = statuses[source.key];
              const isComplete = status.state === "complete";
              const isActive = status.state === "authenticating" || status.state === "syncing";

              return (
                <motion.div
                  key={source.key}
                  layout
                  className={`rounded-xl border p-4 transition-all duration-200 ${
                    isComplete
                      ? "border-white/[0.08] bg-white/[0.03]"
                      : isActive
                      ? "border-white/[0.1] bg-white/[0.02]"
                      : "border-white/[0.06] bg-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                          isComplete ? "bg-white/[0.06] border border-white/10" : "bg-white/[0.03] border border-white/[0.06]"
                        }`}>
                          {isComplete ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                          ) : (
                            <Icon className="h-4.5 w-4.5 text-white/40" />
                          )}
                        </div>
                        {isComplete && (
                          <motion.div
                            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowBg}`}
                            animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.4, 0.8] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-white">{source.label}</span>
                          {isComplete && (
                            <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5">
                              <motion.div className="h-1.5 w-1.5 rounded-full bg-emerald-400" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[13px] text-white/30 mt-0.5 line-clamp-1">
                          {source.description}
                        </p>
                      </div>
                    </div>

                    {!isComplete && !isActive && (
                      <Button
                        size="sm"
                        className={`shrink-0 rounded-lg text-xs font-semibold h-8 px-3.5 ${
                          source.sensorType === "identity"
                            ? "bg-white text-[#0A0A0A] hover:bg-white/90"
                            : "bg-transparent border border-white/20 text-white/60 hover:bg-white/[0.06]"
                        }`}
                        onClick={() => handleConnect(source.key)}
                        disabled={connectingKey !== null}
                      >
                        {source.sensorType === "identity" ? "Verify" : source.sensorType === "ingestor" ? "Import" : "Sync"}
                      </Button>
                    )}

                    {isActive && (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="h-4 w-4 border-2 border-white/10 border-t-white/60 rounded-full"
                        />
                      </div>
                    )}

                    {isComplete && (
                      <div className="shrink-0">
                        <span className="text-[10px] text-emerald-400/60 font-mono">
                          {source.liveMsg}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Sync progress bar */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-1.5">
                          <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${status.progress}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-white/30 font-mono">
                              {status.statusMessage}
                            </span>
                            <span className="text-[11px] text-white/20 font-mono">
                              {status.progress}%
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Completion stats */}
                  <AnimatePresence>
                    {isComplete && status.stats && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        transition={{ duration: 0.2, delay: 0.1 }}
                        className="overflow-hidden"
                      >
                        <p className="text-[11px] text-emerald-400/50 font-mono mt-2 pl-12">
                          {status.stats}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-3 border-t border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-white/20" />
              <p className="text-[11px] text-white/20">Read-only · Data never shared</p>
            </div>
            <div className="flex items-center gap-3">
              {!isUnlocked && (
                <button
                  onClick={handleSkip}
                  className="text-xs text-white/30 hover:text-white/50 transition-colors"
                >
                  Skip for now
                </button>
              )}
              {isUnlocked && (
                <Button
                  size="sm"
                  className="rounded-lg font-semibold text-xs h-8 px-4 bg-white text-[#0A0A0A] hover:bg-white/90"
                  onClick={() => setShowModal(false)}
                >
                  Continue to Dashboard
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Bottom progress bar */}
          {completedCount > 0 && (
            <div className="h-[2px] bg-white/[0.04]">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${(completedCount / SOURCES.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
