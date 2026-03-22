import { useState } from "react";
import { Shield, FileText, Settings, BarChart3, Handshake, Building2, Gauge, BookOpen, Link2, MessageSquare, MapPin, Swords, Layers, Search, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/SettingsDialog";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const topItems = [
{ id: "dashboard" as const, label: "Mission Control", icon: Gauge }];


const companyItems = [
{ id: "company" as const, label: "Company Settings", icon: Building2 },
{ id: "competitors" as const, label: "Competitors", icon: Swords },
{ id: "sector" as const, label: "Sector", icon: Layers },
{ id: "benchmarks" as const, label: "Benchmarks", icon: BarChart3 },
{ id: "audit" as const, label: "Deck Audit", icon: FileText }];


const investorItems = [
{ id: "investors" as const, label: "Matches", icon: Handshake },
{ id: "investor-search" as const, label: "Search", icon: Search },
{ id: "connections" as const, label: "Connections", icon: Link2 }];


const communityItems = [
  { id: "directory" as const, label: "Directory", icon: BookOpen }];


export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [investorsOpen, setInvestorsOpen] = useState(
    activeView === "investors" || activeView === "investor-search" || activeView === "connections"
  );

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
          {topItems.map((item) =>
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              activeView === item.id ?
              "bg-sidebar-accent text-sidebar-accent-foreground" :
              "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )}
          <div className="px-3 py-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/50">My Company</div>
          {companyItems.map((item) =>
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn("gap-2.5 rounded-lg py-2 transition-colors text-xs text-left items-center justify-start flex flex-row font-light font-sans px-[8px]",

            activeView === item.id ?
            "bg-sidebar-accent text-sidebar-accent-foreground" :
            "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )}
          <button
            onClick={() => setInvestorsOpen(!investorsOpen)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3",
              (activeView === "investors" || activeView === "investor-search" || activeView === "connections")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            <Users className="h-4 w-4" />
            Investors
            <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", investorsOpen && "rotate-180")} />
          </button>
          {investorsOpen && (
            <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
              {investorItems.map((item) =>
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-light transition-colors",
                    activeView === item.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}>
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )}
            </div>
          )}
          <div className="px-3 py-1.5 mt-3 text-[10px] font-mono uppercase tracking-wider text-sidebar-foreground/50">Community</div>
          {communityItems.map((item) =>
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              activeView === item.id ?
              "bg-sidebar-accent text-sidebar-accent-foreground" :
              "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
            
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </aside>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>);

}