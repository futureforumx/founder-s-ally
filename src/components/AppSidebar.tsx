import { useState } from "react";
import { FileText, Settings, BarChart3, Handshake, Building2, Gauge, BookOpen, Link2, MapPin, Swords, Layers, Search, ChevronDown, Users, UsersRound, LogOut, UserCog, Sparkles, TrendingUp, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandLogo } from "@/components/BrandLogo";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "market-intelligence" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "data-room" | "settings";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onAgentClick?: () => void;
}

const topItems = [
{ id: "dashboard" as const, label: "Mission Control", icon: Gauge }];

const companyItems = [];


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
            className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", activeView === item.id && "border")}
            style={activeView === item.id ? {
              backgroundColor: "#d1d5db",
              borderColor: "#4b5563",
              color: "#1f2937",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
            } : {}}>

              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )}
          <button
            onClick={() => onViewChange("market-intelligence")}
            className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors mt-2 whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", activeView === "market-intelligence" && "border")}
            style={activeView === "market-intelligence" ? {
              backgroundColor: "#d1d5db",
              borderColor: "#4b5563",
              color: "#1f2937",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
            } : {}}>
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            Market Intelligence
          </button>
          <button
            onClick={() => onViewChange("investors")}
            className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors mt-2 whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", (activeView === "investors" || activeView === "investor-search" || activeView === "connections") && "border")}
            style={(activeView === "investors" || activeView === "investor-search" || activeView === "connections") ? {
              backgroundColor: "#d1d5db",
              borderColor: "#4b5563",
              color: "#1f2937",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
            } : {}}>
            <Users className="h-4 w-4" />
            Investors
          </button>
          <button
            onClick={() => onViewChange("directory")}
            className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors mt-2 whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", (activeView === "directory" || activeView === "groups" || activeView === "events") && "border")}
            style={(activeView === "directory" || activeView === "groups" || activeView === "events") ? {
              backgroundColor: "#d1d5db",
              borderColor: "#4b5563",
              color: "#1f2937",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
            } : {}}>
            <Network className="h-4 w-4" />
            Network
          </button>
          <button
            onClick={() => onViewChange("data-room")}
            className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-thin uppercase tracking-wider transition-colors whitespace-nowrap text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground", activeView === "data-room" && "border")}
            style={activeView === "data-room" ? {
              backgroundColor: "#d1d5db",
              borderColor: "#4b5563",
              color: "#1f2937",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)"
            } : {}}>
            <FileText className="h-4 w-4" />
            Data Room
          </button>
        </nav>

        <div className="border-t border-sidebar-border/30 px-3 py-3 mt-auto">
          <button
            onClick={onAgentClick}
            className="group flex w-full flex-row items-center justify-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 shadow-[0_0_15px_-5px_rgba(139,92,246,0.3)] transition-all hover:bg-violet-500/10 hover:border-violet-500/40 animate-pulse-glow-purple"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform duration-500 leading-none">
            </div>
            <span className="block text-[10px] font-thin uppercase tracking-[0.2em] text-violet-100/90 leading-none">
              AGENT
            </span>
          </button>
        </div>
      </aside>
  );
}
