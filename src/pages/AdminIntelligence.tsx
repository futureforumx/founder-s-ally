import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import {
  Loader2, Activity, Wifi, ScrollText, Brain, Users, History,
  UserRound, BarChart2, Flag, Bot, ClipboardCheck, PanelsTopLeft, LineChart,
} from "lucide-react";
import { AdminOverview }           from "@/components/admin/AdminOverview";
import { AdminAnalytics }          from "@/components/admin/AdminAnalytics";
import { AdminApiHealth }          from "@/components/admin/AdminApiHealth";
import { AdminSyncLogs }           from "@/components/admin/AdminSyncLogs";
import { AdminAiDebugger }         from "@/components/admin/AdminAiDebugger";
import { AdminUserManagement }     from "@/components/admin/AdminUserManagement";
import { AdminRecordUpdates }      from "@/components/admin/AdminRecordUpdates";
import { AdminFirmRecords }        from "@/components/admin/AdminFirmRecords";
import { AdminMarketIntelligence } from "@/components/admin/AdminMarketIntelligence";
import { AdminFreshCapital }       from "@/components/admin/AdminFreshCapital";
import { AdminAiAgentsToolPage }   from "@/components/admin/AdminAiAgentsToolPage";
import { AdminWaitlist }           from "@/components/admin/AdminWaitlist";
import { AdminOnboarding }         from "@/components/admin/AdminOnboarding";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { key: "overview",       label: "Overview",       icon: Activity   },
  { key: "analytics",      label: "Analytics",      icon: LineChart  },
  { key: "users",          label: "Users",           icon: Users      },
  { key: "waitlist",       label: "Waitlist",         icon: ClipboardCheck },
  { key: "firm-records",   label: "Investor Records", icon: UserRound },
  { key: "market-intel",   label: "Market Intel",    icon: BarChart2  },
  { key: "fresh-capital",  label: "Fresh Capital",   icon: Flag       },
  { key: "ai-agents-page", label: "AI Agents page",  icon: Bot        },
  { key: "record-updates", label: "Record Updates",  icon: History    },
  { key: "api-health",     label: "API Health",      icon: Wifi       },
  { key: "sync-logs",      label: "Sync Logs",       icon: ScrollText },
  { key: "ai-debugger",    label: "AI Debugger",     icon: Brain      },
  { key: "onboarding",     label: "Onboarding",      icon: PanelsTopLeft },
] as const;

type AdminView = (typeof NAV_ITEMS)[number]["key"];

const SYSTEM_STATUSES = [
  {
    id: "normal",
    label: "Normal",
    color: "#2EE6A6",
    glow: "rgba(46,230,166,0.55)",
    wash: "rgba(46,230,166,0.03)",
  },
  {
    id: "not-optimal",
    label: "Not optimal",
    color: "#FBBF24",
    glow: "rgba(251,191,36,0.55)",
    wash: "rgba(251,191,36,0.04)",
  },
  {
    id: "attention",
    label: "Immediate attention needed",
    color: "#F87171",
    glow: "rgba(248,113,113,0.55)",
    wash: "rgba(248,113,113,0.05)",
  },
] as const;

type SystemStatusId = (typeof SYSTEM_STATUSES)[number]["id"];

function StatusDot({ color, glow }: { color: string; glow: string }) {
  return (
    <span className="relative mt-0.5 flex h-2 w-2 shrink-0">
      <span
        className="absolute inset-0 animate-ping rounded-full opacity-75"
        style={{ background: color }}
      />
      <span
        className="relative h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${glow}` }}
      />
    </span>
  );
}

export default function AdminIntelligence() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isAppAdmin, isGodMode, loading: adminLoading } = useAppAdmin();
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [systemStatus, setSystemStatus] = useState<SystemStatusId>("normal");
  const [focusFirm, setFocusFirm] = useState<{ id: string; name: string } | null>(null);
  const [focusPerson, setFocusPerson] = useState<{ id: string; name: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const status = SYSTEM_STATUSES.find((item) => item.id === systemStatus) ?? SYSTEM_STATUSES[0];

  const openView = (view: AdminView) => {
    setActiveView(view);
    mainRef.current?.scrollTo({ top: 0 });
  };

  if (loading || adminLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#050505" }}>
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user || !isAppAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen font-sans" style={{ background: "#050505", color: "#e0e0e0" }}>
      {/* sidebar */}
      <aside
        className="flex w-52 shrink-0 flex-col border-r py-6 px-3"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#080808" }}
      >
        <div className="mb-8 px-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: "#2EE6A6" }}>
            admin console
          </span>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white/80">Intelligence</h2>
            {isGodMode && (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                style={{ borderColor: "rgba(245,158,11,0.45)", color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}>
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
                onClick={() => openView(item.key)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? "rgba(46, 230, 166, 0.08)" : "transparent",
                  color: isActive ? "#2EE6A6" : "rgba(255,255,255,0.45)",
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-3">
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: status.wash }}
          >
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
              System
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="mt-1.5 flex w-full items-start gap-2 rounded-md text-left outline-none"
                  aria-label={`System status: ${status.label}. Change status`}
                >
                  <StatusDot color={status.color} glow={status.glow} />
                  <span className="font-mono text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {status.label}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                {SYSTEM_STATUSES.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() => setSystemStatus(option.id)}
                    className="items-start gap-2"
                  >
                    <StatusDot color={option.color} glow={option.glow} />
                    <span>{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-2 w-full rounded-lg border border-red-500 bg-red-300 px-3 py-2 text-[13px] font-medium text-red-950 transition-colors hover:border-red-400 hover:bg-red-400 hover:text-white"
          >
            Exit
          </button>
        </div>
      </aside>

      {/* main */}
      <main ref={mainRef} className="relative flex-1 overflow-y-auto px-8 pb-8">
        {activeView === "overview"       && <AdminOverview onNavigate={openView} />}
        {activeView === "analytics"      && (
          <AdminAnalytics
            onOpenFirmRecord={(id, name) => {
              setFocusPerson(null);
              setFocusFirm({ id, name });
              openView("firm-records");
            }}
            onOpenPersonRecord={(id, name) => {
              setFocusFirm(null);
              setFocusPerson({ id, name });
              openView("firm-records");
            }}
          />
        )}
        {activeView === "users"          && <AdminUserManagement />}
        {activeView === "waitlist"       && <AdminWaitlist />}
        {activeView === "firm-records"   && <AdminFirmRecords focusFirm={focusFirm} focusPerson={focusPerson} />}
        {activeView === "market-intel"   && <AdminMarketIntelligence />}
        {activeView === "fresh-capital"  && <AdminFreshCapital onNavigate={openView} />}
        {activeView === "ai-agents-page" && <AdminAiAgentsToolPage />}
        {activeView === "record-updates" && <AdminRecordUpdates />}
        {activeView === "api-health"     && <AdminApiHealth />}
        {activeView === "sync-logs"      && <AdminSyncLogs />}
        {activeView === "ai-debugger"    && <AdminAiDebugger />}
        {activeView === "onboarding"     && <AdminOnboarding />}
      </main>
    </div>
  );
}
