import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  CreditCard,
  LogOut,
  Radio,
  Settings2,
  SlidersHorizontal,
  User,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NETWORK_SURFACE_DISPLAY_NAME } from "@/lib/networkNavVariant";
import { CompanySettingsLogo } from "@/components/ui/company-settings-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SETTINGS_ITEMS = [
  { key: "personal", label: "Personal", icon: User, tab: "account" },
  { key: "company", label: "Company", icon: Building2, tab: "company" },
  { key: "network", label: NETWORK_SURFACE_DISPLAY_NAME, icon: Radio, tab: "network" },
  { key: "preferences", label: "Preferences", icon: SlidersHorizontal, tab: "notifications" },
  { key: "subscription", label: "Subscription", icon: CreditCard, tab: "subscription" },
  { key: "acct", label: "Account", icon: Settings2, tab: "security" },
] as const;

interface WorkspaceAccountMenuProps {
  companyName?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  hasProfile?: boolean;
  userStage?: string | null;
  profileCompletion?: number;
  personalCompletion?: number;
  onViewChange?: (view: "settings") => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  triggerClassName?: string;
  children: ReactNode;
}

export function WorkspaceAccountMenu({
  companyName,
  logoUrl,
  websiteUrl,
  hasProfile = false,
  userStage,
  profileCompletion = 0,
  personalCompletion = 0,
  onViewChange,
  align = "end",
  side = "bottom",
  triggerClassName,
  children,
}: WorkspaceAccountMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const goSettings = (tab: string) => {
    const fromIntel = location.pathname === "/intelligence";
    if (fromIntel) navigate("/");
    const url = new URL(fromIntel ? `${window.location.origin}/` : window.location.href);
    url.searchParams.set("view", "settings");
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
    onViewChange?.("settings");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClassName} asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-64 p-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
            <CompanySettingsLogo
              companyName={companyName}
              logoUrl={logoUrl}
              websiteUrl={websiteUrl}
              size={64}
              hasProfile={hasProfile}
              imgClassName="h-full w-full rounded-lg object-contain"
              initialClassName="text-xs font-bold text-muted-foreground"
              iconClassName="h-4 w-4 text-muted-foreground/40"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {hasProfile ? companyName : "My Company"}
            </p>
            <span className="mt-0.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {userStage || "Seed"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => goSettings("account")}
          className="group flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              Profile {Math.round((profileCompletion + personalCompletion) / 2)}% Complete
            </p>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-l-full bg-accent/60 transition-all"
                style={{ width: `${personalCompletion / 2}%` }}
              />
              <div
                className="h-full rounded-r-full bg-accent transition-all"
                style={{ width: `${profileCompletion / 2}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[9px] text-muted-foreground/50">Personal</span>
              <span className="text-[9px] text-muted-foreground/50">Company</span>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
        </button>

        <div className="border-b border-border/50" />

        <div className="p-1">
          <DropdownMenuItem
            onClick={() => {
              navigate({ pathname: "/", search: "?view=settings&tab=account" });
              onViewChange?.("settings");
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide"
          >
            <UserCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
            Profile &amp; Workspace
          </DropdownMenuItem>
          {SETTINGS_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onClick={() => goSettings(item.tab)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide"
            >
              <item.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <div className="my-1 border-t border-border/50" />
          <DropdownMenuItem
            onClick={() => signOut()}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide text-destructive transition-colors focus:bg-destructive/5 focus:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
