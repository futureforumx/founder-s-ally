import { useState } from "react";
import { FileText, Settings, BarChart3, Handshake, Building2, Gauge, BookOpen, Link2, MapPin, Swords, Layers, Search, ChevronDown, Users, UsersRound, LogOut, UserCog, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandLogo } from "@/components/BrandLogo";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "settings";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onAgentClick?: () => void;
}

const topItems = [
{ id: "dashboard" as const, label: "Mission Control", icon: Gauge }];

const companyItems = [
{ id: "competitors" as const, label: "Competitors", icon: Swords },
{ id: "sector" as const, label: "Sector", icon: Layers },
{ id: "benchmarks" as const, label: "Benchmarks", icon: BarChart3 },
{ id: "audit" as const, label: "Deck Audit", icon: FileText }];


const communityItems = [
  { id: "directory" as const, label: "Directory", icon: BookOpen },
  { id: "groups" as const, label: "Groups", icon: UsersRound },
  { id: "events" as const, label: "Events", icon: MapPin }];

export function AppSidebar({ activeView, onViewChange, onAgentClick }: AppSidebarProps) {
  const { profile } = useProfile();
  const { user, signOut } = useAuth();
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const [communityOpen, setCommunityOpen] = useState(
    activeView === "directory" || activeView === "groups" || activeView === "events"
  );

  return (
      <aside className="flex h-screen w-44 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5">
          <BrandLogo
            variant="white"
            className="w-[112px]"
          />
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
            onClick={() => onViewChange("investors")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3",
              (activeView === "investors" || activeView === "investor-search" || activeView === "connections")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            <Users className="h-4 w-4" />
            Investors
          </button>
          <button
            onClick={() => setCommunityOpen(!communityOpen)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3",
              (activeView === "directory" || activeView === "groups" || activeView === "events")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            <Users className="h-4 w-4" />
            Network
            <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", communityOpen && "rotate-180")} />
          </button>
          {communityOpen && (
            <div className="ml-4 flex flex-col gap-0.5 mt-0.5">
              {communityItems.map((item) =>
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
        </nav>

        <div className="border-t border-sidebar-border/30 px-3 py-4 mt-auto">
          <button
            onClick={onAgentClick}
            className="group flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-4 shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)] transition-all hover:bg-violet-500/10 hover:border-violet-500/40 animate-pulse-glow-purple"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform duration-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="block text-[13px] font-black uppercase tracking-[0.2em] text-violet-100/90 leading-none mt-1">
              AGENT
            </span>
          </button>
        </div>
      </aside>
  );
}
