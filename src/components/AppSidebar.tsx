import { Shield, LayoutDashboard, FileText, Settings, BarChart3, Handshake, Building2, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeView: "company" | "dashboard" | "audit" | "benchmarks" | "investors";
  onViewChange: (view: "company" | "dashboard" | "audit" | "benchmarks" | "investors") => void;
}

const topItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: Gauge },
];

const companyItems = [
  { id: "company" as const, label: "Mission Control", icon: Building2 },
  { id: "benchmarks" as const, label: "Benchmarks", icon: BarChart3 },
  { id: "investors" as const, label: "Investor Match", icon: Handshake },
  { id: "audit" as const, label: "Deck Audit", icon: FileText },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
          <Shield className="h-4 w-4 text-accent" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">Founder</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/60">Copilot</div>
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {topItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              activeView === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
        <div className="px-3 py-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/50">My Company</div>
        {companyItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              activeView === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
        <div className="px-3 py-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/50">Community</div>
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground">
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}
