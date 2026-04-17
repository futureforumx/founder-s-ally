import { useState, useCallback } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Provider {
  name: string;
  logo: string;
  status: "live" | "down" | "degraded";
  lastSynced: string;
  tokensNearExpiry: number;
  activeWebhooks: number;
}

const PROVIDERS: Provider[] = [
  { name: "Google", logo: "G", status: "live", lastSynced: "2m ago", tokensNearExpiry: 0, activeWebhooks: 3 },
  { name: "Notion", logo: "N", status: "live", lastSynced: "5m ago", tokensNearExpiry: 1, activeWebhooks: 2 },
  { name: "Stripe", logo: "S", status: "live", lastSynced: "1m ago", tokensNearExpiry: 0, activeWebhooks: 5 },
  { name: "Granola", logo: "Gr", status: "degraded", lastSynced: "12m ago", tokensNearExpiry: 1, activeWebhooks: 1 },
  { name: "LinkedIn", logo: "Li", status: "live", lastSynced: "8m ago", tokensNearExpiry: 0, activeWebhooks: 2 },
  { name: "HubSpot", logo: "H", status: "live", lastSynced: "3m ago", tokensNearExpiry: 0, activeWebhooks: 4 },
  { name: "Attio", logo: "At", status: "down", lastSynced: "47m ago", tokensNearExpiry: 0, activeWebhooks: 0 },
];

const STATUS_CONFIG = {
  live: { label: "Live", color: "#2EE6A6", bg: "rgba(46,230,166,0.08)", shadow: "0 0 8px rgba(46,230,166,0.4)" },
  degraded: { label: "Degraded", color: "#FFB800", bg: "rgba(255,184,0,0.08)", shadow: "0 0 8px rgba(255,184,0,0.4)" },
  down: { label: "Down", color: "#FF4444", bg: "rgba(255,68,68,0.08)", shadow: "0 0 8px rgba(255,68,68,0.4)" },
};

export function AdminApiHealth() {
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleForceSync = useCallback((provider: string) => {
    setSyncing(provider);
    setTimeout(() => {
      setSyncing(null);
      toast.success(`${provider} sync completed`, { description: "All records up to date" });
    }, 2000);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">API Health Monitor</h1>
          <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Real-time handshake status for all 7 integrations
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#2EE6A6" }} />
          Auto-refresh: 30s
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {PROVIDERS.map((p) => {
          const cfg = STATUS_CONFIG[p.status];
          const isSyncing = syncing === p.name;

          return (
            <div
              key={p.name}
              className="rounded-xl border p-5 transition-colors"
              style={{
                borderColor: p.status === "down" ? "rgba(255,68,68,0.15)" : "rgba(255,255,255,0.06)",
                background: "#0a0a0a",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg font-mono text-xs font-bold"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {p.logo}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white/85">{p.name}</h3>
                    <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Last synced: {p.lastSynced}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full px-2.5 py-1" style={{ background: cfg.bg }}>
                  <div
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ background: cfg.color, boxShadow: cfg.shadow }}
                  />
                  <span className="font-mono text-[10px] font-bold" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-6">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Tokens Expiring
                  </span>
                  <p className="font-mono text-lg font-bold" style={{ color: p.tokensNearExpiry > 0 ? "#FFB800" : "rgba(255,255,255,0.4)" }}>
                    {p.tokensNearExpiry}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Active Webhooks
                  </span>
                  <p className="font-mono text-lg font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {p.activeWebhooks}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleForceSync(p.name)}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
                  style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing..." : "Force Sync"}
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors hover:bg-white/5"
                  style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}
                >
                  <ExternalLink className="h-3 w-3" />
                  Docs
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
