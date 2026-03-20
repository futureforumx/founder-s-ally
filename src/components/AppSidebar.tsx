import { useState } from "react";
import { Shield, FileText, Settings, BarChart3, Handshake, Building2, Gauge, BookOpen, Link2, MessageSquare, MapPin, User, LogOut, Swords, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const topItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: Gauge },
];

const companyItems = [
  { id: "company" as const, label: "Mission Control", icon: Building2 },
  { id: "competitors" as const, label: "Competitors", icon: Swords },
  { id: "sector" as const, label: "Sector", icon: Layers },
  { id: "benchmarks" as const, label: "Benchmarks", icon: BarChart3 },
  { id: "audit" as const, label: "Deck Audit", icon: FileText },
];

const investorItems = [
  { id: "investors" as const, label: "Matches", icon: Handshake },
  { id: "investor-search" as const, label: "Search", icon: Search },
];

const communityItems = [
  { id: "directory" as const, label: "Directory", icon: BookOpen },
  { id: "connections" as const, label: "Connections", icon: Link2 },
  { id: "messages" as const, label: "Messages", icon: MessageSquare },
  { id: "events" as const, label: "Hubs", icon: MapPin },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user, signOut } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";

  return (
    <>
      <aside className="flex h-screen w-44 flex-col bg-sidebar text-sidebar-foreground">
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
          <div className="px-3 py-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/50">Investors</div>
          {investorItems.map((item) => (
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
          {communityItems.map((item) => (
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
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </aside>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Profile Section */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Profile</h4>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Account</h4>
              <button
                onClick={async () => {
                  await signOut();
                  setSettingsOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border px-4 py-3 text-sm text-destructive transition-colors hover:bg-destructive/10 hover:border-destructive/30"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
