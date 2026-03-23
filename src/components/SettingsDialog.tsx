import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, LogOut, Mail, Linkedin, Twitter, Bell, BellOff,
  CreditCard, CheckCircle2, Shield, Camera, Lock, ArrowRight,
  Sparkles, Crown, Zap, ExternalLink, Calendar, Building2, Users, UserCog, Briefcase,
  Eye
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CompanyTab } from "@/components/settings/CompanyTab";
import { toast } from "sonner";

type SettingsTab = "account" | "company" | "connections" | "notifications" | "privacy" | "billing";

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "company", label: "Company", icon: Building2 },
  { id: "connections", label: "Connections", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Eye },
  { id: "billing", label: "Billing", icon: CreditCard },
];

// ── Connection status persistence (synced with ConnectionsGate) ──
const CONN_KEY = "community-connections-status";
interface ConnStatus { gmail: boolean; linkedin: boolean; twitter: boolean; angellist: boolean }
const ALL_KEYS: (keyof ConnStatus)[] = ["gmail", "linkedin", "twitter", "angellist"];
function loadConn(): ConnStatus {
  try { const r = localStorage.getItem(CONN_KEY); if (r) return JSON.parse(r); } catch {}
  return { gmail: false, linkedin: false, twitter: false, angellist: false };
}
function saveConn(s: ConnStatus) { localStorage.setItem(CONN_KEY, JSON.stringify(s)); }

// ── Notification prefs persistence ──
const NOTIF_KEY = "settings-notification-prefs";
interface NotifPrefs {
  emailDigest: boolean;
  matchAlerts: boolean;
  communityUpdates: boolean;
  productNews: boolean;
  pushEnabled: boolean;
}
const DEFAULT_NOTIFS: NotifPrefs = {
  emailDigest: true, matchAlerts: true, communityUpdates: false,
  productNews: true, pushEnabled: false,
};
function loadNotifs(): NotifPrefs {
  try { const r = localStorage.getItem(NOTIF_KEY); if (r) return JSON.parse(r); } catch {}
  return DEFAULT_NOTIFS;
}
function saveNotifs(n: NotifPrefs) { localStorage.setItem(NOTIF_KEY, JSON.stringify(n)); }

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const { user, signOut } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 rounded-2xl overflow-hidden border-border bg-card max-h-[85vh]">
        <div className="flex h-full min-h-[480px] max-h-[85vh]">
          {/* Sidebar */}
          <div className="w-48 border-r border-border bg-muted/20 p-4 shrink-0 flex flex-col">
            <h2 className="text-sm font-bold text-foreground mb-4 px-2">Settings</h2>
            <nav className="space-y-0.5 flex-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            <Separator className="my-3" />
            <button
              onClick={async () => { await signOut(); onOpenChange(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 max-h-[85vh]">
            <AnimatePresence mode="wait">
              {activeTab === "account" && (
                <AccountTab key="account" displayName={displayName} displayEmail={displayEmail} initials={initials} userId={user?.id} />
              )}
              {activeTab === "connections" && <ConnectionsTab key="connections" />}
              {activeTab === "company" && <CompanyTab key="company" />}
              {activeTab === "notifications" && <NotificationsTab key="notifications" />}
              {activeTab === "privacy" && <PrivacyTab key="privacy" />}
              {activeTab === "billing" && <BillingTab key="billing" />}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Account Tab ──
function AccountTab({ displayName, displayEmail, initials, userId }: { displayName: string; displayEmail: string; initials: string; userId?: string }) {
  const { profile, upsertProfile, loading: profileLoading } = useProfile();
  const [name, setName] = useState(displayName);
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [userType, setUserType] = useState<string>("founder");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync from profile when loaded
  useEffect(() => {
    if (profile) {
      if (profile.full_name) setName(profile.full_name);
      if (profile.title) setTitle(profile.title);
      if (profile.bio) setBio(profile.bio);
      if (profile.location) setLocation(profile.location);
      if (profile.user_type) setUserType(profile.user_type);
      if (profile.linkedin_url) setLinkedinUrl(profile.linkedin_url);
      if (profile.twitter_url) setTwitterUrl(profile.twitter_url);
    }
  }, [profile]);

  const USER_TYPES = [
    { id: "founder", label: "Founder", icon: Users, desc: "Building a startup" },
    { id: "operator", label: "Operator", icon: UserCog, desc: "Fractional or advisory" },
    { id: "investor", label: "Investor", icon: Briefcase, desc: "Investing in startups" },
  ];

  const handleSave = async () => {
    setSaving(true);
    
    // Auto-link company_id if user is a founder
    let companyId: string | null = null;
    if (userType === "founder" && userId) {
      const { data: comp } = await (supabase as any)
        .from("company_analyses")
        .select("id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (comp) companyId = comp.id;
    }

    await upsertProfile({
      full_name: name,
      title,
      bio,
      location,
      user_type: userType,
      linkedin_url: linkedinUrl || null,
      twitter_url: twitterUrl || null,
      ...(companyId ? { company_id: companyId } : {}),
    } as any);
    setSaving(false);
    toast.success("Profile saved");
  };

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Account</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your personal information and security</p>
      </div>

      {/* Avatar & Name */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-lg font-bold text-primary">
            {initials}
          </div>
          <button className="absolute inset-0 flex items-center justify-center rounded-2xl bg-foreground/60 text-background opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">{displayEmail}</p>
          <p className="text-[10px] text-accent mt-0.5 font-medium">Pro Plan</p>
        </div>
      </div>

      <Separator />

      {/* User Type Selection */}
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">I am a</label>
        <div className="flex gap-2">
          {USER_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = userType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => setUserType(type.id)}
                className={`flex-1 flex items-center gap-2.5 rounded-xl border-2 px-3 py-3 transition-all ${
                  isActive
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-border hover:border-border/80 hover:bg-muted/20"
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                  isActive ? "bg-accent/10" : "bg-muted"
                }`}>
                  <Icon className={`h-4 w-4 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div className="text-left min-w-0">
                  <p className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{type.label}</p>
                  <p className="text-[10px] text-muted-foreground">{type.desc}</p>
                </div>
                {isActive && <CheckCircle2 className="h-4 w-4 text-accent shrink-0 ml-auto" />}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {userType === "founder" 
            ? "Your profile will appear in the Founders directory and link to your Mission Control company."
            : userType === "operator"
            ? "Your profile will appear in the Operators directory as fractional talent."
            : "Your profile will be visible to founders seeking investment."
          }
        </p>
      </div>

      <Separator />

      {/* Editable Fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Full Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Title / Role</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CEO & Co-Founder" className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Email Address</label>
          <Input value={displayEmail} disabled className="rounded-lg bg-muted/30 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">Contact support to change your email</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Location</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. San Francisco, CA" className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Brief description of what you're building or your expertise..."
            rows={3}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">LinkedIn URL</label>
            <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">X / Twitter URL</label>
            <Input value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/..." className="rounded-lg" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Admin Access */}
      <AdminAccessSection userId={userId} />

      <Separator />

      {/* Security */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Security</h4>
        <button className="flex w-full items-center justify-between rounded-xl border border-border p-3.5 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Change Password</p>
              <p className="text-[10px] text-muted-foreground">Last updated 30 days ago</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button className="flex w-full items-center justify-between rounded-xl border border-border p-3.5 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
              <p className="text-[10px] text-muted-foreground">Not enabled</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px] uppercase font-bold">Off</Badge>
        </button>
      </div>

      <div className="pt-2 pb-4">
        <Button size="sm" className="rounded-lg font-semibold text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Admin Access Section ──
function AdminAccessSection({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const [toggling, setToggling] = useState(false);
  const isAdmin = user?.user_metadata?.role === "admin";

  const handleToggleAdmin = async () => {
    if (!userId) return;
    setToggling(true);
    try {
      const newRole = isAdmin ? "user" : "admin";
      const { error } = await supabase.auth.updateUser({
        data: { role: newRole },
      });
      if (error) throw error;
      toast.success(newRole === "admin" ? "Admin access enabled" : "Admin access revoked", {
        description: newRole === "admin" ? "Navigate to /admin/intelligence" : "You no longer have admin privileges",
      });
    } catch (e: any) {
      toast.error("Failed to update role", { description: e.message });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Admin Access</h4>
      <div className="flex items-center justify-between rounded-xl border border-border p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Crown className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Platform Admin</p>
            <p className="text-[10px] text-muted-foreground">Access the Intelligence Dashboard at /admin/intelligence</p>
          </div>
        </div>
        <Switch
          checked={isAdmin}
          onCheckedChange={handleToggleAdmin}
          disabled={toggling}
        />
      </div>
    </div>
  );
}

// ── Connections Tab ──
const SETTINGS_INTEGRATIONS = [
  { key: "gmail" as const, label: "Gmail", icon: Mail, desc: "Scan email threads for warm intro discovery", color: "text-red-500", bg: "bg-red-500/10" },
  { key: "linkedin" as const, label: "LinkedIn", icon: Linkedin, desc: "Map your professional network graph", color: "text-blue-600", bg: "bg-blue-600/10" },
  { key: "twitter" as const, label: "X (Twitter)", icon: Twitter, desc: "Track social signals and sentiment", color: "text-foreground", bg: "bg-foreground/5" },
  { key: "calendar" as const, label: "Google Calendar", icon: Calendar, desc: "Detect past VC meetings and intro calls", color: "text-blue-500", bg: "bg-blue-500/10" },
  { key: "angellist" as const, label: "AngelList", icon: Zap, desc: "Sync portfolio follows and investor activity", color: "text-foreground", bg: "bg-foreground/5" },
];

function ConnectionsTab() {
  const [status, setStatus] = useState<ConnStatus>(loadConn);
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleToggle = async (key: keyof ConnStatus) => {
    if (status[key]) {
      const next = { ...status, [key]: false };
      setStatus(next);
      saveConn(next);
    } else {
      setConnecting(key);
      await new Promise((r) => setTimeout(r, 1500));
      const next = { ...status, [key]: true };
      setStatus(next);
      saveConn(next);
      setConnecting(null);
    }
  };

  const connectedCount = ALL_KEYS.filter((k) => status[k]).length;

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Connected Accounts</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Link data sources to power network intelligence</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border p-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{connectedCount}/5 sources linked</p>
          <p className="text-[10px] text-muted-foreground">More connections = better intro paths</p>
        </div>
        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${(connectedCount / 5) * 100}%` }} />
        </div>
      </div>

      {/* Integration Cards */}
      <div className="space-y-2.5">
        {SETTINGS_INTEGRATIONS.map((int) => {
          const Icon = int.icon;
          const isConnected = status[int.key];
          const isConnecting = connecting === int.key;

          return (
            <div key={int.key} className={`rounded-xl border p-4 transition-colors ${isConnected ? "border-accent/30 bg-accent/5" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${isConnected ? "bg-accent/10" : int.bg}`}>
                    {isConnected ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Icon className={`h-4 w-4 ${int.color}`} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{int.label}</span>
                      {isConnected && <Badge variant="outline" className="text-[9px] text-accent border-accent/30 uppercase font-bold">Active</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{int.desc}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isConnected ? "outline" : "default"}
                  className="shrink-0 rounded-lg text-xs font-semibold h-8 px-3"
                  onClick={() => handleToggle(int.key)}
                  disabled={isConnecting || (connecting !== null && connecting !== int.key)}
                >
                  {isConnecting ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-primary-foreground rounded-full" />
                  ) : isConnected ? "Disconnect" : "Connect"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-muted/20 border border-border p-3.5">
        <div className="flex items-center gap-2">
          <Lock className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">Read-only access · Your data is never shared with third parties</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Notifications Tab ──
function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadNotifs);

  const toggle = (key: keyof NotifPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveNotifs(next);
  };

  const ITEMS: { key: keyof NotifPrefs; label: string; desc: string; icon: React.ElementType }[] = [
    { key: "matchAlerts", label: "Match Alerts", desc: "Get notified when new investor matches are found", icon: Zap },
    { key: "emailDigest", label: "Weekly Digest", desc: "Summary of activity, new matches, and community updates", icon: Mail },
    { key: "communityUpdates", label: "Community Updates", desc: "New reviews, intro requests, and founder activity", icon: User },
    { key: "productNews", label: "Product Updates", desc: "New features, improvements, and tips", icon: Sparkles },
    { key: "pushEnabled", label: "Push Notifications", desc: "Browser notifications for time-sensitive alerts", icon: Bell },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Notifications</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Control how and when you receive updates</p>
      </div>

      <div className="space-y-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="flex items-center justify-between rounded-xl p-3.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
              <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
            </div>
          );
        })}
      </div>

      <Separator />

      <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
        <BellOff className="h-4 w-4" />
        Mute all notifications
      </button>
    </motion.div>
  );
}

// ── Privacy Tab ──
const ONBOARDING_KEY = "onboarding-wizard-state";

function PrivacyTab() {
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(ONBOARDING_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          aiInboxPaths: parsed.aiInboxPaths ?? false,
          shareAnonMetrics: parsed.shareAnonMetrics ?? false,
          discoverableToInvestors: parsed.discoverableToInvestors ?? false,
          useMeetingNotes: parsed.useMeetingNotes ?? false,
        };
      }
    } catch {}
    return { aiInboxPaths: false, shareAnonMetrics: false, discoverableToInvestors: false, useMeetingNotes: false };
  });

  const [onboardingData, setOnboardingData] = useState<any>(() => {
    try {
      const saved = localStorage.getItem(ONBOARDING_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const togglePref = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    // Persist back to onboarding state
    try {
      const saved = localStorage.getItem(ONBOARDING_KEY);
      const data = saved ? JSON.parse(saved) : {};
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ ...data, ...next }));
    } catch {}
  };

  const TOGGLES = [
    { key: "aiInboxPaths" as const, title: "Let the AI find warm investor paths in my inbox", sub: "Thread subjects + contact names only. Email bodies never stored.", icon: Mail },
    { key: "shareAnonMetrics" as const, title: "Share anonymized metrics with my founder cohort", sub: "You see how you compare. They never see it's you.", icon: Users },
    { key: "discoverableToInvestors" as const, title: "Make me discoverable to matching investors", sub: "Only investors whose thesis matches your profile will see you.", icon: Sparkles },
    { key: "useMeetingNotes" as const, title: "Use my meeting notes to improve recommendations", sub: "Granola and calendar data only. Delete anytime.", icon: Calendar },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Privacy & AI Consent</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Control how your data is used by the Intelligence Engine</p>
      </div>

      <div className="space-y-2">
        {TOGGLES.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.key} className="flex items-start gap-3 rounded-xl border border-border p-3.5 hover:bg-muted/20 transition-colors">
              <Switch
                checked={prefs[t.key]}
                onCheckedChange={() => togglePref(t.key)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground leading-snug">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">{t.sub}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Onboarding Preferences Summary */}
      {onboardingData && (
        <div className="space-y-4">
          <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Onboarding Preferences</h4>

          {onboardingData.stage && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Stage</span>
              <Badge variant="outline" className="text-[10px]">{onboardingData.stage}</Badge>
            </div>
          )}

          {onboardingData.sectors?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Sectors</span>
              <div className="flex flex-wrap gap-1">
                {onboardingData.sectors.map((s: string) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          {onboardingData.revenueBand && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Revenue Band</span>
              <Badge variant="outline" className="text-[10px]">{onboardingData.revenueBand}</Badge>
            </div>
          )}

          {onboardingData.cofounderCount && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Co-founders</span>
              <Badge variant="outline" className="text-[10px]">{onboardingData.cofounderCount}</Badge>
            </div>
          )}

          {onboardingData.superpowers?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Superpowers</span>
              <div className="flex flex-wrap gap-1">
                {onboardingData.superpowers.map((s: string) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          {onboardingData.currentlyRaising && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-foreground">Currently Raising</p>
              {onboardingData.targetRaise && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Target</span>
                  <span className="text-[10px] font-medium text-foreground">{onboardingData.targetRaise}</span>
                </div>
              )}
              {onboardingData.roundType && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Round</span>
                  <span className="text-[10px] font-medium text-foreground">{onboardingData.roundType}</span>
                </div>
              )}
              {onboardingData.targetCloseDate && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Close Date</span>
                  <span className="text-[10px] font-medium text-foreground">
                    {new Date(onboardingData.targetCloseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          )}

          {onboardingData.connectedIntegrations?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Connected Integrations</span>
              <div className="flex flex-wrap gap-1">
                {onboardingData.connectedIntegrations.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-[10px] capitalize">{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-muted/20 border border-border p-3.5">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">Your data is encrypted at rest and in transit. We never sell your information.</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Billing Tab ──
function BillingTab() {
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Billing & Plan</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your subscription and payment details</p>
      </div>

      {/* Current Plan */}
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Pro Plan</span>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] uppercase font-bold">Active</Badge>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-black text-foreground">$49</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <p className="text-[10px] text-muted-foreground mb-4">Next billing date: April 22, 2026</p>

        <div className="space-y-1.5">
          {["Unlimited investor matches", "AI-powered deck audit", "Community network access", "Priority support"].map((f) => (
            <div key={f} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-accent shrink-0" />
              <span className="text-[10px] text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Usage This Period</h4>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "AI Credits", used: "847", total: "1,000" },
            { label: "Enrichments", used: "23", total: "50" },
            { label: "Exports", used: "5", total: "∞" },
          ].map((u) => (
            <div key={u.label} className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold text-foreground">{u.used}</p>
              <p className="text-[9px] text-muted-foreground">of {u.total}</p>
              <p className="text-[9px] font-medium text-muted-foreground mt-0.5">{u.label}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Payment Method */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Payment Method</h4>
        <div className="flex items-center justify-between rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-12 items-center justify-center rounded-md bg-muted border border-border">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">•••• 4242</p>
              <p className="text-[10px] text-muted-foreground">Expires 12/27</p>
            </div>
          </div>
          <button className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">Update</button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" size="sm" className="rounded-lg text-xs font-semibold">
          <ExternalLink className="h-3 w-3 mr-1.5" />
          View Invoices
        </Button>
        <button className="text-xs text-muted-foreground hover:text-destructive transition-colors">
          Cancel Plan
        </button>
      </div>
    </motion.div>
  );
}
