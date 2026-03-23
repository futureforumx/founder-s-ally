import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Activity, Wifi, ScrollText, Brain } from "lucide-react";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminApiHealth } from "@/components/admin/AdminApiHealth";
import { AdminSyncLogs } from "@/components/admin/AdminSyncLogs";
import { AdminAiDebugger } from "@/components/admin/AdminAiDebugger";
import { AdminUserManagement } from "@/components/admin/AdminUserManagement";
import { Users } from "lucide-react";

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "users", label: "Users", icon: Users },
  { key: "api-health", label: "API Health", icon: Wifi },
  { key: "sync-logs", label: "Sync Logs", icon: ScrollText },
  { key: "ai-debugger", label: "AI Debugger", icon: Brain },
] as const;

type AdminView = (typeof NAV_ITEMS)[number]["key"];

export default function AdminIntelligence() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState<AdminView>("overview");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#050505" }}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  // RBAC: Only admins allowed (checks user_metadata.role set via Settings)
  const role = user?.user_metadata?.role;
  if (!user || role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen font-sans" style={{ background: "#050505", color: "#e0e0e0" }}>
      {/* Admin Sidebar */}
      <aside
        className="flex w-52 shrink-0 flex-col border-r py-6 px-3"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#080808" }}
      >
        <div className="mb-8 px-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: "#39FF14" }}>
            admin console
          </span>
          <h2 className="mt-1 text-sm font-semibold text-white/80">Intelligence</h2>
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeView === "overview" && <AdminOverview onNavigate={setActiveView} />}
        {activeView === "users" && <AdminUserManagement />}
        {activeView === "api-health" && <AdminApiHealth />}
        {activeView === "sync-logs" && <AdminSyncLogs />}
        {activeView === "ai-debugger" && <AdminAiDebugger />}
      </main>
    </div>
  );
}
