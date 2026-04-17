import { useState, useMemo } from "react";
import { Search, RefreshCw, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface SyncLog {
  id: string;
  provider: string;
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  durationMs: number;
  timestamp: string;
  errorMessage?: string;
}

const MOCK_LOGS: SyncLog[] = [
  { id: "log_001", provider: "Google", status: "SUCCESS", recordsSynced: 47, durationMs: 1240, timestamp: "2026-03-23T14:22:00Z" },
  { id: "log_002", provider: "Stripe", status: "SUCCESS", recordsSynced: 12, durationMs: 890, timestamp: "2026-03-23T14:18:00Z" },
  { id: "log_003", provider: "Attio", status: "FAILED", recordsSynced: 0, durationMs: 5200, timestamp: "2026-03-23T14:15:00Z", errorMessage: "Error: OAuth2 token expired at 2026-03-23T14:15:00.123Z.\n\nStack trace:\n  at AttioClient.refreshToken (attio-sdk/auth.ts:142)\n  at AttioClient.syncContacts (attio-sdk/sync.ts:88)\n  at SyncEngine.run (engine/core.ts:245)\n\nThe refresh token has been revoked. Re-authorize the Attio integration from the admin console to restore sync." },
  { id: "log_004", provider: "HubSpot", status: "SUCCESS", recordsSynced: 156, durationMs: 3400, timestamp: "2026-03-23T14:12:00Z" },
  { id: "log_005", provider: "LinkedIn", status: "SUCCESS", recordsSynced: 8, durationMs: 2100, timestamp: "2026-03-23T14:08:00Z" },
  { id: "log_006", provider: "Notion", status: "FAILED", recordsSynced: 3, durationMs: 4800, timestamp: "2026-03-23T13:55:00Z", errorMessage: "Error: Rate limit exceeded (429).\n\nRetry-After: 60s\nEndpoint: /v1/databases/{db_id}/query\n\nThe Notion API rate limit of 3 requests/second has been exceeded. The sync engine will auto-retry in 60 seconds." },
  { id: "log_007", provider: "Granola", status: "SUCCESS", recordsSynced: 22, durationMs: 1800, timestamp: "2026-03-23T13:50:00Z" },
  { id: "log_008", provider: "Google", status: "SUCCESS", recordsSynced: 31, durationMs: 1100, timestamp: "2026-03-23T13:45:00Z" },
  { id: "log_009", provider: "Stripe", status: "SUCCESS", recordsSynced: 5, durationMs: 650, timestamp: "2026-03-23T13:40:00Z" },
  { id: "log_010", provider: "Attio", status: "FAILED", recordsSynced: 0, durationMs: 5100, timestamp: "2026-03-23T13:35:00Z", errorMessage: "Error: Connection refused (ECONNREFUSED).\n\nHost: api.attio.com:443\nThe upstream API appears to be experiencing an outage." },
];

export function AdminSyncLogs() {
  const [search, setSearch] = useState("");
  const [errorDrawer, setErrorDrawer] = useState<SyncLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return MOCK_LOGS;
    const q = search.toLowerCase();
    return MOCK_LOGS.filter(
      (l) => l.provider.toLowerCase().includes(q) || l.status.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)
    );
  }, [search]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success("Sync logs refreshed", { description: `${MOCK_LOGS.length} records loaded` });
    }, 1200);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">Sync Log Viewer</h1>
          <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            The black box — full audit trail for every sync operation
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.2)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by provider, status, or log ID..."
          className="w-full rounded-xl border py-2.5 pl-10 pr-4 font-mono text-xs transition-colors focus:outline-none focus:border-emerald-500/30"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a", color: "rgba(255,255,255,0.7)" }}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#080808" }}>
              {["Log ID", "Provider", "Status", "Records", "Duration", "Timestamp", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr
                key={log.id}
                className="border-t transition-colors"
                style={{
                  borderColor: "rgba(255,255,255,0.04)",
                  background: log.status === "FAILED" ? "rgba(255,68,68,0.04)" : "transparent",
                }}
              >
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {log.id}
                </td>
                <td className="px-4 py-3 text-[12px] font-medium text-white/70">{log.provider}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                    style={{
                      background: log.status === "SUCCESS" ? "rgba(46,230,166,0.08)" : "rgba(255,68,68,0.1)",
                      color: log.status === "SUCCESS" ? "#2EE6A6" : "#FF4444",
                    }}
                  >
                    <div
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: log.status === "SUCCESS" ? "#2EE6A6" : "#FF4444" }}
                    />
                    {log.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {log.recordsSynced.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {log.durationMs.toLocaleString()}ms
                </td>
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {formatTime(log.timestamp)}
                </td>
                <td className="px-4 py-3">
                  {log.status === "FAILED" && (
                    <button
                      onClick={() => setErrorDrawer(log)}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-medium transition-colors hover:bg-red-500/10"
                      style={{ borderColor: "rgba(255,68,68,0.2)", color: "#FF4444" }}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      View Error
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Error Drawer */}
      <Sheet open={!!errorDrawer} onOpenChange={() => setErrorDrawer(null)}>
        <SheetContent className="border-l" style={{ background: "#0a0a0a", borderColor: "rgba(255,68,68,0.15)" }}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-white/90">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Sync Error — {errorDrawer?.provider}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="flex gap-4">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Log ID</span>
                <p className="font-mono text-xs text-white/60">{errorDrawer?.id}</p>
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Duration</span>
                <p className="font-mono text-xs text-white/60">{errorDrawer?.durationMs}ms</p>
              </div>
            </div>
            <div>
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
                Error Message
              </span>
              <pre
                className="mt-2 whitespace-pre-wrap rounded-lg border p-4 font-mono text-[11px] leading-relaxed"
                style={{
                  borderColor: "rgba(255,68,68,0.1)",
                  background: "rgba(255,68,68,0.03)",
                  color: "#FF8888",
                }}
              >
                {errorDrawer?.errorMessage}
              </pre>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
