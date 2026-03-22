import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, Linkedin, Twitter, CheckCircle2, ArrowRight, Shield, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ConnectionStatus {
  gmail: boolean;
  linkedin: boolean;
  twitter: boolean;
}

const STORAGE_KEY = "community-connections-status";

function loadStatus(): ConnectionStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { gmail: false, linkedin: false, twitter: false };
}

function saveStatus(s: ConnectionStatus) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const INTEGRATIONS = [
  {
    key: "gmail" as const,
    label: "Gmail",
    icon: Mail,
    description: "Scan email threads for warm intro paths and shared contacts.",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  {
    key: "linkedin" as const,
    label: "LinkedIn",
    icon: Linkedin,
    description: "Map your professional network to discover 1st & 2nd degree connections.",
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    borderColor: "border-blue-600/20",
  },
  {
    key: "twitter" as const,
    label: "X (Twitter)",
    icon: Twitter,
    description: "Track social sentiment, mentions, and engagement signals.",
    color: "text-foreground",
    bgColor: "bg-foreground/5",
    borderColor: "border-foreground/10",
  },
];

interface ConnectionsGateProps {
  children: React.ReactNode;
}

export function ConnectionsGate({ children }: ConnectionsGateProps) {
  const [status, setStatus] = useState<ConnectionStatus>(loadStatus);
  const [showModal, setShowModal] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const isUnlocked = status.gmail || status.linkedin || status.twitter;
  const connectedCount = [status.gmail, status.linkedin, status.twitter].filter(Boolean).length;

  useEffect(() => {
    if (!isUnlocked) {
      setShowModal(true);
    }
  }, []);

  const handleConnect = async (key: keyof ConnectionStatus) => {
    setConnecting(key);
    // Simulate OAuth flow delay
    await new Promise((r) => setTimeout(r, 1800));
    const next = { ...status, [key]: true };
    setStatus(next);
    saveStatus(next);
    setConnecting(null);
  };

  const handleSkip = () => {
    setShowModal(false);
  };

  // If at least one source is linked, render children
  if (isUnlocked && !showModal) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Locked Background */}
      <div className="relative">
        {/* Blurred preview of community content */}
        <div className="pointer-events-none select-none filter blur-[6px] opacity-40 overflow-hidden max-h-[500px]">
          {children}
        </div>

        {/* Lock Overlay */}
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
            <Button
              onClick={() => setShowModal(true)}
              className="rounded-xl px-6 font-semibold"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Link Accounts
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Connection Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md p-0 gap-0 rounded-2xl overflow-hidden border-border">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Connect Your Sources</h3>
                <p className="text-xs text-muted-foreground">Link accounts to power community intelligence</p>
              </div>
            </div>
          </div>

          {/* Integration Cards */}
          <div className="p-4 space-y-2.5">
            {INTEGRATIONS.map((integration) => {
              const Icon = integration.icon;
              const isConnected = status[integration.key];
              const isConnecting = connecting === integration.key;

              return (
                <motion.div
                  key={integration.key}
                  layout
                  className={`relative rounded-xl border p-4 transition-colors ${
                    isConnected
                      ? "border-accent/30 bg-accent/5"
                      : `${integration.borderColor} bg-card hover:bg-secondary/30`
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isConnected ? "bg-accent/10" : integration.bgColor
                      } shrink-0`}>
                        {isConnected ? (
                          <CheckCircle2 className="h-4.5 w-4.5 text-accent" />
                        ) : (
                          <Icon className={`h-4.5 w-4.5 ${integration.color}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{integration.label}</span>
                          {isConnected && (
                            <span className="text-[9px] uppercase font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                              Connected
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          {integration.description}
                        </p>
                      </div>
                    </div>
                    {!isConnected && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-lg text-xs font-semibold h-8 px-3"
                        onClick={() => handleConnect(integration.key)}
                        disabled={isConnecting || connecting !== null}
                      >
                        {isConnecting ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full"
                          />
                        ) : (
                          <>Connect</>
                        )}
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />
              Read-only access · Data never shared
            </p>
            <div className="flex items-center gap-2">
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
                  Continue
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress */}
          {connectedCount > 0 && (
            <div className="h-1 bg-secondary">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${(connectedCount / 3) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
