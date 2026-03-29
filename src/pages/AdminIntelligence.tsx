import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { Loader2, Activity, Wifi, ScrollText, Brain, Users, History, X } from "lucide-react";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminApiHealth } from "@/components/admin/AdminApiHealth";
import { AdminSyncLogs } from "@/components/admin/AdminSyncLogs";
import { AdminAiDebugger } from "@/components/admin/AdminAiDebugger";
import { AdminUserManagement } from "@/components/admin/AdminUserManagement";
import { AdminRecordUpdates } from "@/components/admin/AdminRecordUpdates";

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "users", label: "Users", icon: Users },
  { key: "record-updates", label: "Record updates", icon: History },
  { key: "api-health", label: "API Health", icon: Wifi },
  { key: "sync-logs", label: "Sync Logs", icon: ScrollText },
  { key: "ai-debugger", label: "AI Debugger", icon: Brain },
] as const;

type AdminView = (typeof NAV_ITEMS)[number]["key"];

export default function AdminIntelligence() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isAppAdmin, isGodMode, loading: adminLoading } = useAppAdmin();
  const [activeView, setActiveView] = useState<AdminView>("overview");

  if (loading || adminLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#050505" }}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user || !isAppAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen font-sans" style={{ background: "#050505", color: "#e0e0e0" }}>
      <aside
        className="flex w-52 shrink-0 flex-col border-r py-6 px-3"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#080808" }}
      >
        <div className="mb-8 px-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: "#39FF14" }}>
            admin console
          </span>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white/80">Intelligence</h2>
            {isGodMode && (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ borderColor: "rgba(245,158,11,0.45)", color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}>
                GOD MODE
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? "rgba(57, 255, 20, 0.08)" : "transparent",
                  color: isActive ? "#39FF14" : "rgba(255,255,255,0.45)",
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-3">
          <div className="rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(57,255,20,0.03)" }}>
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
              System
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#39FF14", boxShadow: "0 0 8px rgba(57,255,20,0.5)" }} />
              <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>All systems nominal</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto p-8">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Close admin and return to app"
          className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors"
          style={{
            borderColor: "rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.65)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
        {activeView === "overview" && <AdminOverview onNavigate={setActiveView} />}
        {activeView === "users" && <AdminUserManagement />}
        {activeView === "record-updates" && <AdminRecordUpdates />}
        {activeView === "api-health" && <AdminApiHealth />}
        {activeView === "sync-logs" && <AdminSyncLogs />}
        {activeView === "ai-debugger" && <AdminAiDebugger />}
      </main>
    </div>
  );
}
