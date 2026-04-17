import { Wifi, ScrollText, Brain, ArrowRight, History, Users } from "lucide-react";

const STATS = [
  { label: "Active Integrations", value: "7/7", color: "#2EE6A6" },
  { label: "Sync Success Rate", value: "98.4%", color: "#2EE6A6" },
  { label: "AI Snippets Today", value: "142", color: "#00D4FF" },
  { label: "Tokens Near Expiry", value: "2", color: "#FF6B35" },
];

type AdminView = "overview" | "users" | "record-updates" | "api-health" | "sync-logs" | "ai-debugger";

interface AdminOverviewProps {
  onNavigate: (view: AdminView) => void;
}

export function AdminOverview({ onNavigate }: AdminOverviewProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white/90">Platform Intelligence</h1>
        <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Real-time health monitoring · Last checked 4s ago
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border p-5"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a" }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
              {s.label}
            </span>
            <p className="mt-2 font-mono text-2xl font-bold" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { key: "users", icon: Users, title: "Users", desc: "Manage permissions and monitor user activity" },
          { key: "record-updates", icon: History, title: "Record updates", desc: "Latest changes across firms, investors, companies, users" },
          { key: "api-health", icon: Wifi, title: "API Health", desc: "Monitor 7 integration endpoints" },
          { key: "sync-logs", icon: ScrollText, title: "Sync Logs", desc: "Search the sync black box" },
          { key: "ai-debugger", icon: Brain, title: "AI Debugger", desc: "Inspect semantic intelligence" },
        ].map((card) => (
          <button
            key={card.key}
            onClick={() => onNavigate(card.key as AdminView)}
            className="group flex flex-col items-start rounded-xl border p-5 text-left transition-colors hover:border-emerald-500/20"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0a0a" }}
          >
            <card.icon className="h-5 w-5 mb-3" style={{ color: "#2EE6A6" }} />
            <span className="text-sm font-semibold text-white/80">{card.title}</span>
            <span className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{card.desc}</span>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#2EE6A6" }}>
              Open <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
