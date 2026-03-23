import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Lock, X, CheckCircle2, Mail, Linkedin, Twitter,
  Calendar, ArrowRight, Sparkles, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// ── Types ──
type SourceKey = "gmail" | "linkedin" | "twitter" | "angellist";

interface SourceStatus {
  state: "idle" | "authenticating" | "syncing" | "complete";
  progress: number;
  statusMessage: string;
  stats: string | null;
}

interface ConnStatus {
  gmail: SourceStatus;
  linkedin: SourceStatus;
  twitter: SourceStatus;
  calendar: SourceStatus;
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
      const keys: SourceKey[] = ["gmail", "linkedin", "twitter", "calendar", "angellist"];
      return new Set(keys.filter((k) => obj[k] === true));
    }
  } catch {}
  return new Set();
}

function saveCompletedSources(completed: Set<SourceKey>) {
  const obj: Record<string, boolean> = {};
  (["gmail", "linkedin", "twitter", "calendar", "angellist"] as SourceKey[]).forEach(
    (k) => (obj[k] = completed.has(k))
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// ── Source Definitions ──
const SOURCES: {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  stats: string;
  unlockMessage: string;
}[] = [
  {
    key: "gmail",
    label: "Gmail",
    icon: Mail,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    description: "Scan email threads for warm intro paths and VC contact graph",
    stats: "2,340 emails scanned · 47 VC contacts found",
    unlockMessage: "🔓 Warm Intro Paths unlocked",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    borderColor: "border-blue-600/20",
    description: "Map your professional network to discover 1st & 2nd degree paths to investors",
    stats: "312 connections mapped · 18 investor paths",
    unlockMessage: "🔓 Network Graph + 2nd-degree paths unlocked",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: Twitter,
    color: "text-foreground",
    bgColor: "bg-foreground/5",
    borderColor: "border-foreground/10",
    description: "Track social sentiment, mentions, and engagement with investor accounts",
    stats: "1,280 interactions analyzed · 9 VCs engaged",
    unlockMessage: "🔓 Social Sentiment Analysis unlocked",
  },
  {
    key: "calendar",
    label: "Google Calendar",
    icon: Calendar,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    description: "Detect past VC meetings, intro calls, and recurring investor contacts",
    stats: "14 VC meetings found · 6 recurring contacts",
    unlockMessage: "🔓 Meeting History unlocked",
  },
  {
    key: "angellist",
    label: "AngelList",
    icon: Zap,
    color: "text-foreground",
    bgColor: "bg-foreground/5",
    borderColor: "border-foreground/10",
    description: "Sync portfolio follows, past applications, and investor activity",
    stats: "8 applications synced · 23 investors tracked",
    unlockMessage: "🔓 Investor Activity Feed unlocked",
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
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 rounded-2xl overflow-hidden border-border shadow-xl">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-foreground leading-tight">Connect Your Sources</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Link accounts to power community intelligence</p>
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
                  className={`rounded-xl border p-4 transition-colors ${
                    isComplete
                      ? "border-accent/30 bg-accent/5"
                      : isActive
                      ? "border-primary/30 bg-primary/5"
                      : `${source.borderColor} bg-card hover:bg-secondary/20`
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                          isComplete ? "bg-accent/10" : source.bgColor
                        }`}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="h-4.5 w-4.5 text-accent" />
                        ) : (
                          <Icon className={`h-4.5 w-4.5 ${source.color}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-foreground">{source.label}</span>
                          {isComplete && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-1">
                          {source.description}
                        </p>
                      </div>
                    </div>

                    {!isComplete && !isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-lg text-xs font-semibold h-8 px-3.5 border-foreground/20"
                        onClick={() => handleConnect(source.key)}
                        disabled={connectingKey !== null}
                      >
                        Connect
                      </Button>
                    )}

                    {isActive && (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="h-4 w-4 border-2 border-muted-foreground/20 border-t-primary rounded-full"
                        />
                      </div>
                    )}

                    {isComplete && (
                      <div className="shrink-0">
                        <span className="text-[9px] uppercase font-bold text-accent bg-accent/10 px-2 py-1 rounded-md">
                          Connected
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
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className="h-full bg-accent rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${status.progress}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground font-medium">
                              {status.statusMessage}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
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
                        <p className="text-[11px] text-accent font-medium mt-2 pl-12">
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
          <div className="px-6 pb-5 pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">Read-only access · Data never shared</p>
            </div>
            <div className="flex items-center gap-3">
              {!isUnlocked && (
                <button
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              )}
              {isUnlocked && (
                <Button
                  size="sm"
                  className="rounded-lg font-semibold text-xs h-8 px-4"
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
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-accent"
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
