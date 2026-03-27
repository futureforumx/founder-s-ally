import { useState } from "react";
import { FileText, Settings, Handshake, Building2, Gauge, BookOpen, Link2, MapPin, Search, ChevronDown, Users, UsersRound, LogOut, UserCog, TrendingUp, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandLogo } from "@/components/BrandLogo";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "market-intelligence" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "data-room" | "settings";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const topItems = [
{ id: "dashboard" as const, label: "Mission Control", icon: Gauge }];

const companyItems = [];


const communityItems = [
  { id: "directory" as const, label: "Directory", icon: BookOpen },
  { id: "groups" as const, label: "Groups", icon: UsersRound },
  { id: "events" as const, label: "Events", icon: MapPin }];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
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
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors border text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            style={activeView === item.id ? {
              backgroundColor: "#ede9fe",
              borderColor: "#6f48b1",
              color: "#6f48b1"
            } : {}}>

              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          )}
          <button
            onClick={() => onViewChange("market-intelligence")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3 whitespace-nowrap border text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            style={activeView === "market-intelligence" ? {
              backgroundColor: "#ede9fe",
              borderColor: "#6f48b1",
              color: "#6f48b1"
            } : {}}>
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            Market Intelligence
          </button>
          <button
            onClick={() => onViewChange("investors")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3 border text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            style={(activeView === "investors" || activeView === "investor-search" || activeView === "connections") ? {
              backgroundColor: "#ede9fe",
              borderColor: "#6f48b1",
              color: "#6f48b1"
            } : {}}>
            <Users className="h-4 w-4" />
            Investors
          </button>
          <button
            onClick={() => onViewChange("directory")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors mt-3 border text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            style={(activeView === "directory" || activeView === "groups" || activeView === "events") ? {
              backgroundColor: "#ede9fe",
              borderColor: "#6f48b1",
              color: "#6f48b1"
            } : {}}>
            <Network className="h-4 w-4" />
            Network
          </button>
          <button
            onClick={() => onViewChange("data-room")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors border text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            style={activeView === "data-room" ? {
              backgroundColor: "#ede9fe",
              borderColor: "#6f48b1",
              color: "#6f48b1"
            } : {}}>
            <FileText className="h-4 w-4" />
            Data Room
          </button>
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors border text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                style={activeView === "settings" ? {
                  backgroundColor: "#ede9fe",
                  borderColor: "#6f48b1",
                  color: "#6f48b1"
                } : {}}>
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="h-5 w-5 rounded-full object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary shrink-0">
                    {initials}
                  </div>
                )}
                <span className="truncate">{displayName}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-48 p-1.5">
              {activeView !== "settings" && (
                <button
                  onClick={() => onViewChange("settings")}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <UserCog className="h-4 w-4" />
                  Settings
                </button>
              )}
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>
  );
}
