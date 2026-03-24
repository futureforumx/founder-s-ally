import { useState, useCallback, useEffect } from "react";
const BRAND_ICONS: Record<string, string> = {
  google: "https://cdn.simpleicons.org/google/4285F4",
  linkedin: "https://cdn.simpleicons.org/linkedin/0A66C2",
  notion: "https://cdn.simpleicons.org/notion/000000",
  stripe: "https://cdn.simpleicons.org/stripe/635BFF",
  granola: "https://www.google.com/s2/favicons?domain=granola.ai&sz=128",
  hubspot: "https://cdn.simpleicons.org/hubspot/FF7A59",
  attio: "https://www.google.com/s2/favicons?domain=attio.com&sz=128",
  twitter: "https://cdn.simpleicons.org/x/000000",
  instagram: "https://cdn.simpleicons.org/instagram/E4405F",
  facebook: "https://cdn.simpleicons.org/facebook/0866FF",
  tiktok: "https://cdn.simpleicons.org/tiktok/000000",
  zoom: "https://cdn.simpleicons.org/zoom/0B5CFF",
  googlemeet: "https://cdn.simpleicons.org/googlemeet/00897B",
  microsoftteams: "https://cdn.simpleicons.org/microsoftteams/6264A7",
  slack: "https://cdn.simpleicons.org/slack/4A154B",
  whatsapp: "https://cdn.simpleicons.org/whatsapp/25D366",
  discord: "https://cdn.simpleicons.org/discord/5865F2",
  airtable: "https://cdn.simpleicons.org/airtable/18BFFF",
  pipedrive: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=128",
  square: "https://cdn.simpleicons.org/square/006AFF",
  plaid: "https://www.google.com/s2/favicons?domain=plaid.com&sz=128",
  shopify: "https://cdn.simpleicons.org/shopify/7AB55C",
  polar: "https://www.google.com/s2/favicons?domain=polar.sh&sz=128",
  gusto: "https://www.google.com/s2/favicons?domain=gusto.com&sz=128",
  zapier: "https://cdn.simpleicons.org/zapier/FF4A00",
  relay: "https://www.google.com/s2/favicons?domain=relay.app&sz=128",
  gumloop: "https://www.google.com/s2/favicons?domain=gumloop.com&sz=128",
  n8n: "https://cdn.simpleicons.org/n8n/EA4B71",
  make: "https://cdn.simpleicons.org/make/6D00CC",
  mailchimp: "https://cdn.simpleicons.org/mailchimp/FFE01B",
  klaviyo: "https://www.google.com/s2/favicons?domain=klaviyo.com&sz=128",
  canva: "https://cdn.simpleicons.org/canva/00C4CC",
  googleanalytics: "https://cdn.simpleicons.org/googleanalytics/E37400",
  posthog: "https://cdn.simpleicons.org/posthog/F9BD2B",
  clerk: "https://www.google.com/s2/favicons?domain=clerk.com&sz=128",
};
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Linkedin, Twitter, CheckCircle2, Lock,
  Shield, RefreshCw, Sparkles, AlertCircle,
  Database, Users, Network, TrendingUp, BarChart3, X as XIcon,
  Settings2, Activity, Check, CreditCard, BookOpen, FileText,
  MessageSquare, Contact, Layers, Video, MonitorSmartphone, Hash,
  Camera, Facebook as FacebookIcon, Music2, PhoneCall,
  Table2, PieChart, ShoppingCart, DollarSign, Wallet, Banknote,
  Zap, GitBranch, Workflow, Repeat2,
  MailOpen, Palette, Megaphone,
  LineChart, Eye, UserCheck, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";

// ── Types ──
export type SourceKey =
  | "google" | "linkedin" | "notion" | "stripe" | "granola" | "hubspot" | "attio" | "twitter"
  | "instagram" | "facebook" | "tiktok" | "zoom" | "googlemeet" | "microsoftteams"
  | "slack" | "whatsapp" | "discord"
  | "airtable" | "pipedrive" | "square" | "plaid" | "shopify" | "polar" | "gusto"
  | "zapier" | "relay" | "gumloop" | "n8n" | "make"
  | "mailchimp" | "klaviyo" | "canva"
  | "googleanalytics" | "posthog" | "clerk";

export type FilterCategory = "recommended" | "crm" | "social" | "meetings" | "messaging" | "finance" | "workflows" | "marketing" | "analytics";

const STORAGE_KEY = "community-connections-status";
const SYNC_DETAIL_KEY = "connections-sync-detail";

export const ALL_KEYS: SourceKey[] = [
  "google", "linkedin", "notion", "stripe", "granola", "hubspot", "attio", "twitter",
  "instagram", "facebook", "tiktok", "zoom", "googlemeet", "microsoftteams",
  "slack", "whatsapp", "discord",
  "airtable", "pipedrive", "square", "plaid", "shopify", "polar", "gusto",
  "zapier", "relay", "gumloop", "n8n", "make",
  "mailchimp", "klaviyo", "canva",
  "googleanalytics", "posthog", "clerk",
];

export function loadConnected(): Record<SourceKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if ("gmail" in parsed && !("google" in parsed)) { parsed.google = parsed.gmail; delete parsed.gmail; }
      const result: any = {};
      ALL_KEYS.forEach(k => result[k] = parsed[k] || false);
      return result;
    }
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach(k => def[k] = false);
  return def;
}
export function saveConnected(s: Record<SourceKey, boolean>) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function loadSyncDetails(): Record<SourceKey, { lastSynced: string | null }> {
  try {
    const raw = localStorage.getItem(SYNC_DETAIL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const def: any = {};
  ALL_KEYS.forEach(k => def[k] = { lastSynced: null });
  return def;
}
function saveSyncDetails(d: Record<SourceKey, { lastSynced: string | null }>) { localStorage.setItem(SYNC_DETAIL_KEY, JSON.stringify(d)); }

// ── Sensor Config ──
type SensorSection = "recommended" | "power" | "signal";

interface SourceConfig {
  key: SourceKey;
  label: string;
  icon: React.ElementType;
  customIcon?: string;
  glowColor: string;
  glowHsl: string;
  description: string;
  categoryTag: string;
  liveStats: string;
  connectedStats: { label: string; value: string }[];
  syncStages: string[];
  unlockToast: string;
  connectLabel: string;
  disconnectWarning: string;
  section: SensorSection;
  note?: string;
  filterCategories: FilterCategory[];
}

const SOURCES: SourceConfig[] = [
  // ── RECOMMENDED ──
  {
    key: "google", label: "Google", icon: Mail, customIcon: BRAND_ICONS.google, section: "recommended",
    categoryTag: "INTELLIGENCE PIPELINE", filterCategories: ["recommended"],
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.35)]", glowHsl: "bg-indigo-500",
    description: "Gmail + Calendar — unified workspace sync",
    liveStats: "142 threads analyzed",
    connectedStats: [{ label: "Threads Analyzed", value: "142" }, { label: "VC Contacts", value: "47" }, { label: "Signals Found", value: "12" }],
    syncStages: ["Authenticating...", "Scanning inbox...", "Mapping calendar...", "Building signal graph...", "Complete ✓"],
    unlockToast: "🔓 Warm Intro Paths unlocked", connectLabel: "Connect with Google", disconnectWarning: "Disconnect Google? This will pause email thread analysis.",
  },
  {
    key: "linkedin", label: "LinkedIn", icon: Linkedin, customIcon: BRAND_ICONS.linkedin, section: "recommended",
    categoryTag: "PROFESSIONAL IDENTITY", filterCategories: ["recommended", "social"],
    glowColor: "shadow-[0_0_24px_rgba(59,130,246,0.3)]", glowHsl: "bg-blue-500",
    description: "Map your professional network graph",
    liveStats: "2nd Degree: +4,218",
    connectedStats: [{ label: "Connections", value: "312" }, { label: "2nd Degree", value: "4,218" }, { label: "Mutual Intros", value: "7" }],
    syncStages: ["Authenticating...", "Mapping network...", "Resolving paths...", "Building graph...", "Complete ✓"],
    unlockToast: "🔓 Network Graph unlocked", connectLabel: "Connect with LinkedIn", disconnectWarning: "Disconnect LinkedIn? This will pause network graph updates.",
  },
  {
    key: "notion", label: "Notion", icon: BookOpen, customIcon: BRAND_ICONS.notion, section: "recommended",
    categoryTag: "KNOWLEDGE BASE", filterCategories: ["recommended"],
    glowColor: "shadow-[0_0_24px_rgba(255,255,255,0.12)]", glowHsl: "bg-foreground",
    description: "Import your investor tracker + research docs",
    liveStats: "24 pages synced · 18 investors imported",
    connectedStats: [{ label: "Pages Synced", value: "24" }, { label: "Investors Imported", value: "18" }, { label: "Docs Indexed", value: "7" }],
    syncStages: ["Authenticating...", "Scanning workspace...", "Indexing pages...", "Extracting investors...", "Complete ✓"],
    unlockToast: "🔓 Knowledge Base synced", connectLabel: "Connect with Notion", disconnectWarning: "Disconnect Notion? This will pause document syncing.",
  },
  {
    key: "stripe", label: "Stripe", icon: CreditCard, customIcon: BRAND_ICONS.stripe, section: "recommended",
    categoryTag: "TRACTION SIGNALS", filterCategories: ["recommended", "finance"],
    glowColor: "shadow-[0_0_24px_rgba(139,92,246,0.3)]", glowHsl: "bg-violet-500",
    description: "Real-time MRR, churn, and growth signals",
    liveStats: "MRR: $12.4K · +18% MoM",
    connectedStats: [{ label: "MRR", value: "$12.4K" }, { label: "Growth", value: "+18%" }, { label: "Churn", value: "2.1%" }],
    syncStages: ["Authenticating...", "Fetching metrics...", "Calculating MRR...", "Analyzing trends...", "Complete ✓"],
    unlockToast: "🔓 Traction Metrics verified", connectLabel: "Connect with Stripe", disconnectWarning: "Disconnect Stripe? This will pause revenue metric updates.", note: "Read-only restricted key",
  },
  // ── CRM ──
  {
    key: "attio", label: "Attio", icon: Layers, customIcon: BRAND_ICONS.attio, section: "power",
    categoryTag: "VC-NATIVE CRM", filterCategories: ["crm"],
    glowColor: "shadow-[0_0_24px_rgba(168,85,247,0.3)]", glowHsl: "bg-purple-500",
    description: "Sync your VC-native relationship CRM",
    liveStats: "89 people synced · 4 lists imported",
    connectedStats: [{ label: "People Synced", value: "89" }, { label: "Lists Imported", value: "4" }, { label: "Relationships", value: "234" }],
    syncStages: ["Authenticating...", "Fetching people...", "Syncing lists...", "Mapping relationships...", "Complete ✓"],
    unlockToast: "🔓 VC CRM synced", connectLabel: "Connect with Attio", disconnectWarning: "Disconnect Attio? This will pause relationship syncing.",
  },
  {
    key: "airtable", label: "Airtable", icon: Table2, customIcon: BRAND_ICONS.airtable, section: "power",
    categoryTag: "FLEXIBLE CRM", filterCategories: ["crm"],
    glowColor: "shadow-[0_0_24px_rgba(24,191,255,0.3)]", glowHsl: "bg-cyan-500",
    description: "Sync custom bases, pipeline views, and deal trackers",
    liveStats: "3 bases · 156 records synced",
    connectedStats: [{ label: "Bases", value: "3" }, { label: "Records", value: "156" }, { label: "Views", value: "8" }],
    syncStages: ["Authenticating...", "Scanning bases...", "Syncing records...", "Mapping fields...", "Complete ✓"],
    unlockToast: "🔓 Airtable bases synced", connectLabel: "Connect Airtable", disconnectWarning: "Disconnect Airtable? This will pause base syncing.",
  },
  {
    key: "hubspot", label: "HubSpot", icon: Contact, customIcon: BRAND_ICONS.hubspot, section: "power",
    categoryTag: "CRM PIPELINE", filterCategories: ["crm"],
    glowColor: "shadow-[0_0_24px_rgba(251,146,60,0.3)]", glowHsl: "bg-orange-500",
    description: "Import investor + customer pipeline",
    liveStats: "156 contacts synced · 23 deals imported",
    connectedStats: [{ label: "Contacts Synced", value: "156" }, { label: "Deals Imported", value: "23" }, { label: "Pipeline Value", value: "$1.2M" }],
    syncStages: ["Authenticating...", "Fetching contacts...", "Syncing deals...", "Building pipeline...", "Complete ✓"],
    unlockToast: "🔓 CRM Pipeline synced", connectLabel: "Connect with HubSpot", disconnectWarning: "Disconnect HubSpot? This will pause contact and deal syncing.",
  },
  {
    key: "pipedrive", label: "Pipedrive", icon: PieChart, customIcon: BRAND_ICONS.pipedrive, section: "power",
    categoryTag: "SALES CRM", filterCategories: ["crm"],
    glowColor: "shadow-[0_0_24px_rgba(22,22,22,0.2)]", glowHsl: "bg-foreground",
    description: "Sync deals, contacts, and sales pipeline",
    liveStats: "34 deals · 12 in pipeline",
    connectedStats: [{ label: "Deals", value: "34" }, { label: "In Pipeline", value: "12" }, { label: "Won", value: "8" }],
    syncStages: ["Authenticating...", "Fetching deals...", "Syncing contacts...", "Mapping pipeline...", "Complete ✓"],
    unlockToast: "🔓 Pipedrive pipeline synced", connectLabel: "Connect Pipedrive", disconnectWarning: "Disconnect Pipedrive? This will pause deal syncing.",
  },
  // ── SOCIAL ──
  {
    key: "twitter", label: "X (Twitter)", icon: Twitter, customIcon: BRAND_ICONS.twitter, section: "signal",
    categoryTag: "SOCIAL INTELLIGENCE", filterCategories: ["social"],
    glowColor: "shadow-[0_0_24px_rgba(255,255,255,0.12)]", glowHsl: "bg-foreground",
    description: "Investor thesis signals + competitor moves",
    liveStats: "89 mutual follows · 7 investor signals this week",
    connectedStats: [{ label: "Mutual Follows", value: "89" }, { label: "Signals/Week", value: "7" }, { label: "VCs Tracked", value: "12" }],
    syncStages: ["Authenticating...", "Scanning timeline...", "Analyzing sentiment...", "Mapping investors...", "Complete ✓"],
    unlockToast: "🔓 Social Intelligence unlocked", connectLabel: "Connect with X", disconnectWarning: "Disconnect X? This will pause social signal tracking.",
  },
  {
    key: "instagram", label: "Instagram", icon: Camera, customIcon: BRAND_ICONS.instagram, section: "signal",
    categoryTag: "SOCIAL PRESENCE", filterCategories: ["social"],
    glowColor: "shadow-[0_0_24px_rgba(228,64,95,0.3)]", glowHsl: "bg-pink-500",
    description: "Track brand mentions and founder reach",
    liveStats: "1.2K followers · 8 brand mentions",
    connectedStats: [{ label: "Followers", value: "1.2K" }, { label: "Brand Mentions", value: "8" }, { label: "Reach", value: "4.5K" }],
    syncStages: ["Authenticating...", "Scanning posts...", "Analyzing reach...", "Mapping mentions...", "Complete ✓"],
    unlockToast: "🔓 Instagram signals active", connectLabel: "Connect Instagram", disconnectWarning: "Disconnect Instagram? This will pause brand mention tracking.",
  },
  {
    key: "facebook", label: "Facebook", icon: Users, customIcon: BRAND_ICONS.facebook, section: "signal",
    categoryTag: "SOCIAL NETWORK", filterCategories: ["social"],
    glowColor: "shadow-[0_0_24px_rgba(8,102,255,0.3)]", glowHsl: "bg-blue-600",
    description: "Community groups and page engagement",
    liveStats: "320 page likes · 5 group connections",
    connectedStats: [{ label: "Page Likes", value: "320" }, { label: "Groups", value: "5" }, { label: "Engagement", value: "2.8%" }],
    syncStages: ["Authenticating...", "Scanning pages...", "Mapping groups...", "Analyzing engagement...", "Complete ✓"],
    unlockToast: "🔓 Facebook insights active", connectLabel: "Connect Facebook", disconnectWarning: "Disconnect Facebook? This will pause page and group syncing.",
  },
  {
    key: "tiktok", label: "TikTok", icon: Music2, customIcon: BRAND_ICONS.tiktok, section: "signal",
    categoryTag: "SHORT-FORM VIDEO", filterCategories: ["social"],
    glowColor: "shadow-[0_0_24px_rgba(0,0,0,0.15)]", glowHsl: "bg-foreground",
    description: "Track viral reach and brand awareness",
    liveStats: "450 views · 3 trending tags",
    connectedStats: [{ label: "Views", value: "450" }, { label: "Trending Tags", value: "3" }, { label: "Shares", value: "12" }],
    syncStages: ["Authenticating...", "Fetching analytics...", "Mapping trends...", "Analyzing reach...", "Complete ✓"],
    unlockToast: "🔓 TikTok analytics active", connectLabel: "Connect TikTok", disconnectWarning: "Disconnect TikTok? This will pause video analytics.",
  },
  // ── MEETINGS ──
  {
    key: "granola", label: "Granola", icon: FileText, customIcon: BRAND_ICONS.granola, section: "power",
    categoryTag: "MEETING INTELLIGENCE", filterCategories: ["meetings"],
    glowColor: "shadow-[0_0_24px_rgba(234,179,8,0.3)]", glowHsl: "bg-yellow-500",
    description: "Turns investor meeting notes into action items",
    liveStats: "8 meetings processed · 3 follow-ups surfaced",
    connectedStats: [{ label: "Meetings", value: "8" }, { label: "Follow-ups", value: "3" }, { label: "Actions", value: "12" }],
    syncStages: ["Authenticating...", "Scanning meetings...", "Extracting notes...", "Generating actions...", "Complete ✓"],
    unlockToast: "🔓 Meeting Intelligence active", connectLabel: "Connect with Granola", disconnectWarning: "Disconnect Granola? This will pause meeting note processing.",
  },
  {
    key: "zoom", label: "Zoom", icon: Video, customIcon: BRAND_ICONS.zoom, section: "power",
    categoryTag: "VIDEO MEETINGS", filterCategories: ["meetings"],
    glowColor: "shadow-[0_0_24px_rgba(11,92,255,0.3)]", glowHsl: "bg-blue-500",
    description: "Auto-capture investor call notes and follow-ups",
    liveStats: "12 calls recorded · 5 action items",
    connectedStats: [{ label: "Calls Recorded", value: "12" }, { label: "Action Items", value: "5" }, { label: "Hours Saved", value: "3.2" }],
    syncStages: ["Authenticating...", "Fetching recordings...", "Transcribing...", "Extracting actions...", "Complete ✓"],
    unlockToast: "🔓 Zoom meeting intelligence active", connectLabel: "Connect Zoom", disconnectWarning: "Disconnect Zoom? This will pause meeting capture.",
  },
  {
    key: "googlemeet", label: "Google Meet", icon: Video, customIcon: BRAND_ICONS.googlemeet, section: "power",
    categoryTag: "VIDEO MEETINGS", filterCategories: ["meetings"],
    glowColor: "shadow-[0_0_24px_rgba(0,137,123,0.3)]", glowHsl: "bg-teal-500",
    description: "Capture meeting transcripts and investor signals",
    liveStats: "9 meetings · 4 follow-ups surfaced",
    connectedStats: [{ label: "Meetings", value: "9" }, { label: "Follow-ups", value: "4" }, { label: "Transcripts", value: "9" }],
    syncStages: ["Authenticating...", "Fetching meetings...", "Transcribing...", "Analyzing...", "Complete ✓"],
    unlockToast: "🔓 Google Meet intelligence active", connectLabel: "Connect Google Meet", disconnectWarning: "Disconnect Google Meet? This will pause meeting transcription.",
  },
  {
    key: "microsoftteams", label: "Microsoft Teams", icon: MonitorSmartphone, customIcon: BRAND_ICONS.microsoftteams, section: "power",
    categoryTag: "VIDEO MEETINGS", filterCategories: ["meetings"],
    glowColor: "shadow-[0_0_24px_rgba(98,100,167,0.3)]", glowHsl: "bg-indigo-500",
    description: "Sync Teams calls, chats, and meeting notes",
    liveStats: "6 calls synced · 2 action items",
    connectedStats: [{ label: "Calls Synced", value: "6" }, { label: "Action Items", value: "2" }, { label: "Chats", value: "14" }],
    syncStages: ["Authenticating...", "Fetching calls...", "Syncing chats...", "Extracting notes...", "Complete ✓"],
    unlockToast: "🔓 Teams meeting sync active", connectLabel: "Connect Teams", disconnectWarning: "Disconnect Microsoft Teams? This will pause meeting syncing.",
  },
  // ── MESSAGING ──
  {
    key: "slack", label: "Slack", icon: Hash, customIcon: BRAND_ICONS.slack, section: "signal",
    categoryTag: "TEAM COMMS", filterCategories: ["messaging"],
    glowColor: "shadow-[0_0_24px_rgba(74,21,75,0.3)]", glowHsl: "bg-purple-700",
    description: "Surface investor mentions and deal chatter",
    liveStats: "42 channels monitored · 3 investor mentions",
    connectedStats: [{ label: "Channels", value: "42" }, { label: "Investor Mentions", value: "3" }, { label: "Alerts", value: "7" }],
    syncStages: ["Authenticating...", "Scanning channels...", "Indexing messages...", "Mapping mentions...", "Complete ✓"],
    unlockToast: "🔓 Slack intelligence active", connectLabel: "Connect Slack", disconnectWarning: "Disconnect Slack? This will pause channel monitoring.",
  },
  {
    key: "whatsapp", label: "WhatsApp", icon: PhoneCall, customIcon: BRAND_ICONS.whatsapp, section: "signal",
    categoryTag: "MESSAGING", filterCategories: ["messaging"],
    glowColor: "shadow-[0_0_24px_rgba(37,211,102,0.3)]", glowHsl: "bg-green-500",
    description: "Track investor conversations and introductions",
    liveStats: "18 investor threads · 2 warm intros",
    connectedStats: [{ label: "Threads", value: "18" }, { label: "Warm Intros", value: "2" }, { label: "Messages", value: "234" }],
    syncStages: ["Authenticating...", "Scanning chats...", "Mapping contacts...", "Analyzing threads...", "Complete ✓"],
    unlockToast: "🔓 WhatsApp insights active", connectLabel: "Connect WhatsApp", disconnectWarning: "Disconnect WhatsApp? This will pause conversation tracking.",
  },
  {
    key: "discord", label: "Discord", icon: MessageSquare, customIcon: BRAND_ICONS.discord, section: "signal",
    categoryTag: "COMMUNITY", filterCategories: ["messaging"],
    glowColor: "shadow-[0_0_24px_rgba(88,101,242,0.3)]", glowHsl: "bg-indigo-500",
    description: "Monitor community channels and investor discussions",
    liveStats: "5 servers · 12 relevant threads",
    connectedStats: [{ label: "Servers", value: "5" }, { label: "Threads", value: "12" }, { label: "Signals", value: "4" }],
    syncStages: ["Authenticating...", "Scanning servers...", "Indexing threads...", "Extracting signals...", "Complete ✓"],
    unlockToast: "🔓 Discord community insights active", connectLabel: "Connect Discord", disconnectWarning: "Disconnect Discord? This will pause community monitoring.",
  },
  // ── FINANCE ──
  {
    key: "square", label: "Square", icon: ShoppingCart, customIcon: BRAND_ICONS.square, section: "power",
    categoryTag: "PAYMENTS", filterCategories: ["finance"],
    glowColor: "shadow-[0_0_24px_rgba(0,106,255,0.3)]", glowHsl: "bg-blue-600",
    description: "POS transactions and payment volume metrics",
    liveStats: "$8.2K processed · 142 transactions",
    connectedStats: [{ label: "Volume", value: "$8.2K" }, { label: "Transactions", value: "142" }, { label: "Growth", value: "+12%" }],
    syncStages: ["Authenticating...", "Fetching transactions...", "Calculating volume...", "Analyzing trends...", "Complete ✓"],
    unlockToast: "🔓 Square payments synced", connectLabel: "Connect Square", disconnectWarning: "Disconnect Square? This will pause payment tracking.",
  },
  {
    key: "plaid", label: "Plaid", icon: Wallet, customIcon: BRAND_ICONS.plaid, section: "power",
    categoryTag: "BANKING DATA", filterCategories: ["finance"],
    glowColor: "shadow-[0_0_24px_rgba(0,0,0,0.15)]", glowHsl: "bg-foreground",
    description: "Bank account connections and cash flow insights",
    liveStats: "2 accounts linked · $45K balance",
    connectedStats: [{ label: "Accounts", value: "2" }, { label: "Balance", value: "$45K" }, { label: "Runway", value: "8mo" }],
    syncStages: ["Authenticating...", "Linking accounts...", "Fetching balances...", "Analyzing cash flow...", "Complete ✓"],
    unlockToast: "🔓 Banking data connected", connectLabel: "Connect Plaid", disconnectWarning: "Disconnect Plaid? This will pause bank data syncing.",
  },
  {
    key: "shopify", label: "Shopify Payments", icon: ShoppingCart, customIcon: BRAND_ICONS.shopify, section: "power",
    categoryTag: "E-COMMERCE", filterCategories: ["finance"],
    glowColor: "shadow-[0_0_24px_rgba(122,181,92,0.3)]", glowHsl: "bg-green-500",
    description: "Storefront revenue, orders, and growth metrics",
    liveStats: "$22K revenue · 312 orders",
    connectedStats: [{ label: "Revenue", value: "$22K" }, { label: "Orders", value: "312" }, { label: "AOV", value: "$70" }],
    syncStages: ["Authenticating...", "Fetching orders...", "Calculating revenue...", "Analyzing growth...", "Complete ✓"],
    unlockToast: "🔓 Shopify metrics synced", connectLabel: "Connect Shopify", disconnectWarning: "Disconnect Shopify? This will pause e-commerce tracking.",
  },
  {
    key: "polar", label: "Polar", icon: DollarSign, customIcon: BRAND_ICONS.polar, section: "power",
    categoryTag: "MONETIZATION", filterCategories: ["finance"],
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.3)]", glowHsl: "bg-indigo-500",
    description: "Open-source funding and subscription metrics",
    liveStats: "$1.8K MRR · 24 subscribers",
    connectedStats: [{ label: "MRR", value: "$1.8K" }, { label: "Subscribers", value: "24" }, { label: "Growth", value: "+8%" }],
    syncStages: ["Authenticating...", "Fetching subscriptions...", "Calculating MRR...", "Analyzing retention...", "Complete ✓"],
    unlockToast: "🔓 Polar monetization synced", connectLabel: "Connect Polar", disconnectWarning: "Disconnect Polar? This will pause subscription tracking.",
  },
  {
    key: "gusto", label: "Gusto", icon: Banknote, customIcon: BRAND_ICONS.gusto, section: "power",
    categoryTag: "PAYROLL", filterCategories: ["finance"],
    glowColor: "shadow-[0_0_24px_rgba(251,146,60,0.3)]", glowHsl: "bg-orange-400",
    description: "Payroll, headcount, and burn rate signals",
    liveStats: "8 employees · $42K/mo burn",
    connectedStats: [{ label: "Headcount", value: "8" }, { label: "Monthly Burn", value: "$42K" }, { label: "Runway", value: "11mo" }],
    syncStages: ["Authenticating...", "Fetching payroll...", "Calculating burn...", "Analyzing headcount...", "Complete ✓"],
    unlockToast: "🔓 Payroll & burn connected", connectLabel: "Connect Gusto", disconnectWarning: "Disconnect Gusto? This will pause payroll syncing.",
  },
  // ── WORKFLOWS ──
  {
    key: "zapier", label: "Zapier", icon: Zap, customIcon: BRAND_ICONS.zapier, section: "power",
    categoryTag: "AUTOMATION", filterCategories: ["workflows"],
    glowColor: "shadow-[0_0_24px_rgba(255,74,0,0.3)]", glowHsl: "bg-orange-500",
    description: "Automate investor outreach and pipeline updates",
    liveStats: "12 zaps active · 340 tasks/mo",
    connectedStats: [{ label: "Active Zaps", value: "12" }, { label: "Tasks/Mo", value: "340" }, { label: "Hours Saved", value: "8" }],
    syncStages: ["Authenticating...", "Fetching zaps...", "Mapping triggers...", "Syncing status...", "Complete ✓"],
    unlockToast: "🔓 Zapier automations synced", connectLabel: "Connect Zapier", disconnectWarning: "Disconnect Zapier? This will pause automation tracking.",
  },
  {
    key: "relay", label: "Relay.app", icon: GitBranch, customIcon: BRAND_ICONS.relay, section: "power",
    categoryTag: "AUTOMATION", filterCategories: ["workflows"],
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.3)]", glowHsl: "bg-indigo-500",
    description: "Human-in-the-loop workflow automations",
    liveStats: "6 workflows · 89 runs this month",
    connectedStats: [{ label: "Workflows", value: "6" }, { label: "Runs", value: "89" }, { label: "Approvals", value: "23" }],
    syncStages: ["Authenticating...", "Fetching workflows...", "Syncing runs...", "Mapping approvals...", "Complete ✓"],
    unlockToast: "🔓 Relay workflows synced", connectLabel: "Connect Relay", disconnectWarning: "Disconnect Relay? This will pause workflow tracking.",
  },
  {
    key: "gumloop", label: "Gumloop", icon: Workflow, customIcon: BRAND_ICONS.gumloop, section: "power",
    categoryTag: "AI WORKFLOWS", filterCategories: ["workflows"],
    glowColor: "shadow-[0_0_24px_rgba(139,92,246,0.3)]", glowHsl: "bg-violet-500",
    description: "AI-powered pipeline automations",
    liveStats: "4 loops · 56 executions",
    connectedStats: [{ label: "Loops", value: "4" }, { label: "Executions", value: "56" }, { label: "Saved", value: "3h" }],
    syncStages: ["Authenticating...", "Fetching loops...", "Syncing runs...", "Mapping outputs...", "Complete ✓"],
    unlockToast: "🔓 Gumloop automations synced", connectLabel: "Connect Gumloop", disconnectWarning: "Disconnect Gumloop? This will pause AI workflow tracking.",
  },
  {
    key: "n8n", label: "n8n", icon: Repeat2, customIcon: BRAND_ICONS.n8n, section: "power",
    categoryTag: "WORKFLOW ENGINE", filterCategories: ["workflows"],
    glowColor: "shadow-[0_0_24px_rgba(234,75,113,0.3)]", glowHsl: "bg-rose-500",
    description: "Self-hosted workflow automations and integrations",
    liveStats: "8 workflows · 120 executions",
    connectedStats: [{ label: "Workflows", value: "8" }, { label: "Executions", value: "120" }, { label: "Nodes", value: "34" }],
    syncStages: ["Authenticating...", "Fetching workflows...", "Syncing executions...", "Mapping nodes...", "Complete ✓"],
    unlockToast: "🔓 n8n workflows synced", connectLabel: "Connect n8n", disconnectWarning: "Disconnect n8n? This will pause workflow syncing.",
  },
  {
    key: "make", label: "Make", icon: Workflow, customIcon: BRAND_ICONS.make, section: "power",
    categoryTag: "VISUAL AUTOMATION", filterCategories: ["workflows"],
    glowColor: "shadow-[0_0_24px_rgba(109,0,204,0.3)]", glowHsl: "bg-purple-600",
    description: "Visual automation scenarios for operations",
    liveStats: "5 scenarios · 200 operations/mo",
    connectedStats: [{ label: "Scenarios", value: "5" }, { label: "Operations", value: "200" }, { label: "Saved", value: "4h" }],
    syncStages: ["Authenticating...", "Fetching scenarios...", "Syncing runs...", "Mapping operations...", "Complete ✓"],
    unlockToast: "🔓 Make automations synced", connectLabel: "Connect Make", disconnectWarning: "Disconnect Make? This will pause automation syncing.",
  },
  // ── MARKETING ──
  {
    key: "mailchimp", label: "Mailchimp", icon: MailOpen, customIcon: BRAND_ICONS.mailchimp, section: "signal",
    categoryTag: "EMAIL MARKETING", filterCategories: ["marketing"],
    glowColor: "shadow-[0_0_24px_rgba(255,224,27,0.3)]", glowHsl: "bg-yellow-400",
    description: "Newsletter performance and subscriber growth",
    liveStats: "2.4K subscribers · 42% open rate",
    connectedStats: [{ label: "Subscribers", value: "2.4K" }, { label: "Open Rate", value: "42%" }, { label: "Campaigns", value: "12" }],
    syncStages: ["Authenticating...", "Fetching lists...", "Syncing campaigns...", "Analyzing performance...", "Complete ✓"],
    unlockToast: "🔓 Mailchimp analytics synced", connectLabel: "Connect Mailchimp", disconnectWarning: "Disconnect Mailchimp? This will pause email analytics.",
  },
  {
    key: "klaviyo", label: "Klaviyo", icon: Megaphone, customIcon: BRAND_ICONS.klaviyo, section: "signal",
    categoryTag: "EMAIL & SMS", filterCategories: ["marketing"],
    glowColor: "shadow-[0_0_24px_rgba(0,0,0,0.15)]", glowHsl: "bg-foreground",
    description: "Email and SMS marketing automation metrics",
    liveStats: "1.8K profiles · 38% click rate",
    connectedStats: [{ label: "Profiles", value: "1.8K" }, { label: "Click Rate", value: "38%" }, { label: "Flows", value: "6" }],
    syncStages: ["Authenticating...", "Fetching profiles...", "Syncing flows...", "Analyzing metrics...", "Complete ✓"],
    unlockToast: "🔓 Klaviyo marketing synced", connectLabel: "Connect Klaviyo", disconnectWarning: "Disconnect Klaviyo? This will pause marketing analytics.",
  },
  {
    key: "canva", label: "Canva", icon: Palette, customIcon: BRAND_ICONS.canva, section: "signal",
    categoryTag: "DESIGN", filterCategories: ["marketing"],
    glowColor: "shadow-[0_0_24px_rgba(0,196,204,0.3)]", glowHsl: "bg-teal-400",
    description: "Sync pitch deck designs and brand assets",
    liveStats: "14 designs · 3 brand kits",
    connectedStats: [{ label: "Designs", value: "14" }, { label: "Brand Kits", value: "3" }, { label: "Templates", value: "8" }],
    syncStages: ["Authenticating...", "Fetching designs...", "Syncing brand kits...", "Mapping assets...", "Complete ✓"],
    unlockToast: "🔓 Canva designs synced", connectLabel: "Connect Canva", disconnectWarning: "Disconnect Canva? This will pause design syncing.",
  },
  // ── ANALYTICS ──
  {
    key: "googleanalytics", label: "Google Analytics", icon: LineChart, customIcon: BRAND_ICONS.googleanalytics, section: "signal",
    categoryTag: "WEB ANALYTICS", filterCategories: ["analytics"],
    glowColor: "shadow-[0_0_24px_rgba(227,116,0,0.3)]", glowHsl: "bg-orange-500",
    description: "Website traffic, conversions, and user behavior",
    liveStats: "12K sessions · 3.2% conversion",
    connectedStats: [{ label: "Sessions", value: "12K" }, { label: "Conversion", value: "3.2%" }, { label: "Users", value: "8.4K" }],
    syncStages: ["Authenticating...", "Fetching properties...", "Syncing metrics...", "Analyzing trends...", "Complete ✓"],
    unlockToast: "🔓 Google Analytics synced", connectLabel: "Connect GA", disconnectWarning: "Disconnect Google Analytics? This will pause traffic metrics.",
  },
  {
    key: "posthog", label: "PostHog", icon: Eye, customIcon: BRAND_ICONS.posthog, section: "signal",
    categoryTag: "PRODUCT ANALYTICS", filterCategories: ["analytics"],
    glowColor: "shadow-[0_0_24px_rgba(249,189,43,0.3)]", glowHsl: "bg-yellow-500",
    description: "Product usage, funnels, and feature adoption",
    liveStats: "4.2K events/day · 68% retention",
    connectedStats: [{ label: "Events/Day", value: "4.2K" }, { label: "Retention", value: "68%" }, { label: "Funnels", value: "5" }],
    syncStages: ["Authenticating...", "Fetching events...", "Syncing funnels...", "Analyzing retention...", "Complete ✓"],
    unlockToast: "🔓 PostHog analytics synced", connectLabel: "Connect PostHog", disconnectWarning: "Disconnect PostHog? This will pause product analytics.",
  },
  {
    key: "clerk", label: "Clerk", icon: UserCheck, customIcon: BRAND_ICONS.clerk, section: "signal",
    categoryTag: "AUTH & USERS", filterCategories: ["analytics"],
    glowColor: "shadow-[0_0_24px_rgba(99,102,241,0.3)]", glowHsl: "bg-indigo-500",
    description: "User signups, auth events, and growth metrics",
    liveStats: "890 users · 12 signups today",
    connectedStats: [{ label: "Total Users", value: "890" }, { label: "Signups Today", value: "12" }, { label: "DAU", value: "234" }],
    syncStages: ["Authenticating...", "Fetching users...", "Syncing events...", "Analyzing growth...", "Complete ✓"],
    unlockToast: "🔓 Clerk user analytics synced", connectLabel: "Connect Clerk", disconnectWarning: "Disconnect Clerk? This will pause user analytics.",
  },
];



const SECTIONS: { key: SensorSection; label: string; sub: string }[] = [
  { key: "recommended", label: "RECOMMENDED", sub: "Connect these first — highest impact on your matches" },
  { key: "power", label: "POWER SENSORS", sub: "For founders actively fundraising" },
  { key: "signal", label: "SIGNAL SOURCES", sub: "Social and market intelligence" },
];

async function simulateSync(key: SourceKey, onProgress: (p: number, m: string) => void) {
  const source = SOURCES.find(s => s.key === key)!;
  const stages = source.syncStages;
  const stops = [10, 60, 85, 99, 100];
  for (let i = 0; i < stages.length; i++) {
    onProgress(stops[i], stages[i]);
    await new Promise(r => setTimeout(r, i === stages.length - 1 ? 400 : 800));
  }
}

function SparklinePulse() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3, 0.7, 0.5, 0.8, 0.6].map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-success/70"
          animate={{ height: [`${h * 12}px`, `${h * 5}px`, `${h * 12}px`] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

const TERMINAL_LOGS = [
  { time: "19:02", source: "GMAIL", msg: "4 new investor threads identified" },
  { time: "19:03", source: "CALENDAR", msg: "VC meeting detected → auto-tagged" },
  { time: "19:05", source: "STRIPE", msg: "MRR metrics recalculated → $12.4K" },
  { time: "19:07", source: "LINKEDIN", msg: "2nd-degree graph updated (+14 nodes)" },
  { time: "19:09", source: "NOTION", msg: "Investor tracker synced — 3 new entries" },
  { time: "19:11", source: "SYSTEM", msg: "Intelligence Engine score: 72%" },
];

const FILTER_CATEGORIES: { key: FilterCategory; label: string }[] = [
  { key: "recommended", label: "RECOMMENDED" },
  { key: "crm", label: "CRM" },
  { key: "social", label: "SOCIAL" },
  { key: "meetings", label: "MEETINGS" },
  { key: "messaging", label: "MESSAGING" },
  { key: "finance", label: "FINANCE" },
  { key: "workflows", label: "WORKFLOWS" },
  { key: "marketing", label: "MARKETING" },
  { key: "analytics", label: "ANALYTICS" },
];

interface SensorSuiteGridProps {
  compact?: boolean;
  showHeader?: boolean;
  showTerminal?: boolean;
  showCategoryFilter?: boolean;
}

export function SensorSuiteGrid({ compact = false, showHeader = true, showTerminal = true, showCategoryFilter = false }: SensorSuiteGridProps) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("recommended");
  const [searchQuery, setSearchQuery] = useState("");
  const [connected, setConnected] = useState<Record<SourceKey, boolean>>(loadConnected);
  const [syncDetails, setSyncDetails] = useState(loadSyncDetails);
  const [syncStates, setSyncStates] = useState<Record<SourceKey, { syncing: boolean; progress: number; message: string }>>(() => {
    const init: any = {};
    ALL_KEYS.forEach(k => init[k] = { syncing: false, progress: 0, message: "" });
    return init;
  });
  const [activeConnect, setActiveConnect] = useState<SourceKey | null>(null);
  const [hoveredCard, setHoveredCard] = useState<SourceKey | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<SourceKey | null>(null);

  const connectedCount = ALL_KEYS.filter(k => connected[k]).length;

  const handleConnect = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Connecting..." } }));

    await new Promise(r => setTimeout(r, 1500));
    await simulateSync(key, (progress, message) => {
      setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });

    const now = new Date().toISOString();
    const nextConnected = { ...connected, [key]: true };
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };

    setConnected(nextConnected);
    setSyncDetails(nextDetails);
    saveConnected(nextConnected);
    saveSyncDetails(nextDetails);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);

    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ["#6366f1", "#34d399", "#818cf8"] });
    const source = SOURCES.find(s => s.key === key)!;
    toast.success("Intelligence Pipeline Established", { description: source.unlockToast });
  }, [activeConnect, connected, syncDetails]);

  const handleResync = useCallback(async (key: SourceKey) => {
    if (activeConnect) return;
    setActiveConnect(key);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress: 0, message: "Re-syncing..." } }));
    await simulateSync(key, (progress, message) => {
      setSyncStates(prev => ({ ...prev, [key]: { syncing: true, progress, message } }));
    });
    const now = new Date().toISOString();
    const nextDetails = { ...syncDetails, [key]: { lastSynced: now } };
    setSyncDetails(nextDetails);
    saveSyncDetails(nextDetails);
    setSyncStates(prev => ({ ...prev, [key]: { syncing: false, progress: 100, message: "" } }));
    setActiveConnect(null);
    toast.success(`${SOURCES.find(s => s.key === key)!.label} re-synced`);
  }, [activeConnect, syncDetails]);

  const confirmDisconnect = () => {
    if (!disconnectTarget) return;
    const nextConnected = { ...connected, [disconnectTarget]: false };
    setConnected(nextConnected);
    saveConnected(nextConnected);
    toast(`${SOURCES.find(s => s.key === disconnectTarget)!.label} disconnected`);
    setDisconnectTarget(null);
  };

  function formatLastSynced(iso: string | null): string {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function SensorCard({
    source,
    index,
    sensorId,
    sensorName,
    displayIcon,
  }: {
    source: SourceConfig;
    index: number;
    sensorId: string;
    sensorName: string;
    displayIcon?: string;
  }) {
    const Icon = source.icon;
    const isConnected = connected[source.key];
    const sync = syncStates[source.key];
    const isSyncing = sync.syncing;
    const isHovered = hoveredCard === source.key;
    const [iconLoadFailed, setIconLoadFailed] = useState(false);
    const isGoogleSensor = sensorId === "google_workspace" || sensorName?.toLowerCase().includes("google");

    useEffect(() => {
      setIconLoadFailed(false);
    }, [displayIcon]);

    if (compact) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`group rounded-xl border p-4 transition-all duration-200 ${
            isConnected ? "border-border bg-card shadow-sm" : "border-border bg-card hover:border-accent/30"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                  isConnected ? "bg-primary/5 border border-primary/10" : "bg-muted border border-border"
                }`}>
                  {displayIcon && !iconLoadFailed ? (
                    <img
                      key={sensorId}
                      src={displayIcon}
                      alt={sensorName}
                      className="h-5 w-5 object-contain transition-transform duration-200 group-hover:scale-110"
                      onError={() => setIconLoadFailed(true)}
                    />
                  ) : null}
                  {displayIcon && iconLoadFailed && isGoogleSensor ? (
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black"
                      style={{ backgroundColor: "hsl(217 89% 61%)", color: "hsl(0 0% 100%)" }}
                    >
                      G
                    </div>
                  ) : null}
                  {(!displayIcon || (iconLoadFailed && !isGoogleSensor)) ? (
                    <Icon className={`h-4 w-4 ${isConnected ? "text-primary" : "text-muted-foreground"}`} />
                  ) : null}
                </div>
                {isConnected && (
                  <motion.div
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowHsl}`}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.4, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{source.label}</span>
                  {isConnected && (
                    <div className="flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2 py-0.5">
                      <motion.div className="h-1.5 w-1.5 rounded-full bg-success" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                      <span className="text-[9px] font-bold text-success uppercase tracking-wider">Live</span>
                    </div>
                  )}
                </div>
                <p className="text-[9px] font-mono uppercase tracking-wider mt-0.5 text-muted-foreground/50">{source.categoryTag}</p>
                <p className="text-[10px] mt-0.5 text-muted-foreground">{source.description}</p>
                {isConnected && <p className="text-[10px] text-success/80 font-mono mt-1">{source.liveStats}</p>}
              </div>
            </div>
            <Button
              size="sm"
              className={`shrink-0 rounded-lg text-xs font-semibold h-8 px-3 ${
                isSyncing ? "bg-transparent border border-border"
                  : isConnected ? "bg-transparent border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5"
                  : "bg-transparent border border-border text-muted-foreground hover:bg-secondary hover:border-accent/30"
              }`}
              onClick={() => isConnected ? setDisconnectTarget(source.key) : handleConnect(source.key)}
              disabled={isSyncing || (activeConnect !== null && activeConnect !== source.key)}
            >
              {isSyncing ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-3.5 w-3.5 border-2 border-border border-t-foreground/60 rounded-full" />
              ) : isConnected ? "Disconnect" : source.connectLabel}
            </Button>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
        onMouseEnter={() => setHoveredCard(source.key)}
        onMouseLeave={() => setHoveredCard(null)}
        className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${
          isConnected
            ? "border-border bg-card shadow-md"
            : "border-border bg-card hover:border-accent/30 hover:shadow-md"
        }`}
      >
        {isConnected && (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.03] via-transparent to-transparent pointer-events-none" />
        )}

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                  isConnected ? "border-success/20 bg-success/5" : "border-border bg-secondary"
                }`}>
                  {isConnected ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <>
                      {displayIcon && !iconLoadFailed ? (
                        <img
                          key={sensorId}
                          src={displayIcon}
                          alt={sensorName}
                          className="h-5 w-5 object-contain transition-transform duration-200 group-hover:scale-110"
                          onError={() => setIconLoadFailed(true)}
                        />
                      ) : null}
                      {displayIcon && iconLoadFailed && isGoogleSensor ? (
                        <div
                          className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black"
                          style={{ backgroundColor: "hsl(217 89% 61%)", color: "hsl(0 0% 100%)" }}
                        >
                          G
                        </div>
                      ) : null}
                      {(!displayIcon || (iconLoadFailed && !isGoogleSensor)) ? (
                        <Icon className={isGoogleSensor ? "h-4 w-4 text-[hsl(217_89%_61%)]" : "h-4 w-4 text-muted-foreground"} />
                      ) : null}
                    </>
                  )}
                </div>
                {isConnected && (
                  <motion.div
                    className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${source.glowHsl}`}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.9, 0.3, 0.9] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-foreground tracking-tight">{source.label}</h3>
                <p className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider mt-0.5">{source.categoryTag}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isConnected && !isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-1">
                  <motion.div className="h-1.5 w-1.5 rounded-full bg-success" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                  <span className="text-[10px] font-semibold text-success uppercase tracking-wider">Live</span>
                </div>
              )}
              {!isConnected && !isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full bg-secondary border border-border px-2.5 py-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Not Connected</span>
                </div>
              )}
              <AnimatePresence>
                {isHovered && isConnected && !isSyncing && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
                  >
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mb-4">{source.description}</p>

          {isConnected && !isSyncing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <SparklinePulse />
                <span className="text-[10px] text-success/80 font-mono">{source.liveStats}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {source.connectedStats.map(stat => (
                  <div key={stat.label} className="rounded-lg bg-secondary/60 border border-border p-2.5">
                    <p className="text-lg font-bold text-foreground font-mono tracking-tight">{stat.value}</p>
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-medium mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
              {syncDetails[source.key]?.lastSynced && (
                <p className="text-[10px] text-muted-foreground/50 font-mono mt-2">Last synced: {formatLastSynced(syncDetails[source.key].lastSynced)}</p>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {isSyncing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                <div className="rounded-lg bg-secondary/60 border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-mono">{sync.message}</span>
                    <span className="text-[11px] text-muted-foreground/60 font-mono">{sync.progress}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-accent to-success rounded-full"
                      animate={{ width: `${sync.progress}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 font-mono">Historical backfill in progress...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between">
            {!isConnected && !isSyncing && (
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  onClick={() => handleConnect(source.key)}
                  disabled={activeConnect !== null}
                  className="rounded-lg text-xs font-semibold h-9 px-5 bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  {source.connectLabel}
                </Button>
                {source.note && <p className="text-[10px] text-muted-foreground/50 font-mono">{source.note}</p>}
              </div>
            )}
            {isConnected && !isSyncing && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary" onClick={() => handleResync(source.key)} disabled={activeConnect !== null}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-sync
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-[11px] h-7 px-2.5 text-destructive/50 hover:text-destructive hover:bg-destructive/5" onClick={() => setDisconnectTarget(source.key)}>
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
            {isSyncing && (
              <div className="flex items-center gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-4 w-4 border-2 border-border border-t-foreground/60 rounded-full" />
                <span className="text-[11px] text-muted-foreground font-mono">Syncing...</span>
              </div>
            )}
          </div>
        </div>

        {isSyncing && (
          <div className="h-[2px] bg-secondary">
            <motion.div className="h-full bg-gradient-to-r from-accent via-success to-accent" animate={{ width: `${sync.progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* Disconnect Modal */}
      <AnimatePresence>
        {disconnectTarget && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm" onClick={() => setDisconnectTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Confirm Disconnect</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  {SOURCES.find(s => s.key === disconnectTarget)?.disconnectWarning}
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-9 px-4 text-muted-foreground hover:text-foreground hover:bg-secondary" onClick={() => setDisconnectTarget(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="rounded-lg text-xs h-9 px-4 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20" onClick={confirmDisconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Header KPI */}
        {showHeader && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 border border-success/20">
                  <Database className="h-4 w-4 text-success" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{connectedCount}/9 sensors active</h2>
                  <p className="text-xs text-muted-foreground">More connections = richer intelligence</p>
                </div>
              </div>
              {connectedCount >= 3 && (
                <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-success" /><span className="text-xs font-semibold text-success">Full Intelligence</span></div>
              )}
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden mb-2">
              <motion.div
                className="h-full bg-gradient-to-r from-success to-success/80 rounded-full"
                animate={{ width: `${(connectedCount / 9) * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              {connectedCount} connected · Investor matches improve with each sensor
            </p>
          </motion.div>
        )}

        {/* Empty State */}
        {connectedCount === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-dashed border-border bg-secondary/30 p-12 flex flex-col items-center justify-center text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 mb-4">
              <Sparkles className="h-7 w-7 text-accent" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">Your Intelligence Engine is waiting</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Connect Gmail or Notion to get your first investor recommendations
            </p>
            <Button
              size="sm"
              onClick={() => handleConnect("google")}
              disabled={activeConnect !== null}
              className="rounded-lg text-sm font-semibold h-10 px-6 bg-accent text-accent-foreground hover:bg-accent/90 transition-all"
            >
              Connect Gmail →
            </Button>
          </motion.div>
        )}

        {/* Search + Category Filter */}
        {showCategoryFilter && (
          <div className="space-y-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find an integration..."
                className="w-full h-8 rounded-lg border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
              />
            </div>
            {!searchQuery && (
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted w-fit">
                {FILTER_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setActiveFilter(cat.key)}
                    className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-wide transition-all font-mono font-bold ${
                      activeFilter === cat.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sensor Sections */}
        {showCategoryFilter ? (
          // Filtered flat list mode
          <div className={compact ? "space-y-2.5" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
            {SOURCES.filter(s => {
              if (searchQuery.trim()) {
                return s.label.toLowerCase().includes(searchQuery.trim().toLowerCase());
              }
              return s.filterCategories.includes(activeFilter);
            }).map((source, i) => {
              const sensor = { id: String(source.key), name: source.label, icon_url: source.customIcon };
              const displayIcon = sensor.id === "google_workspace" || sensor.name?.toLowerCase().includes("google")
                ? "https://cdn.simpleicons.org/googleworkspace/4285F4"
                : sensor.icon_url;

              return (
                <SensorCard
                  key={source.key}
                  source={source}
                  index={i}
                  sensorId={sensor.id}
                  sensorName={sensor.name}
                  displayIcon={displayIcon}
                />
              );
            })}
          </div>
        ) : (
          // Original section-based layout
          SECTIONS.map((section, si) => {
            const sectionSources = SOURCES.filter(s => s.section === section.key);
            return (
              <div key={section.key}>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 + si * 0.1 }}
                  className="mb-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <h2 className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground font-semibold">{section.label}</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 ml-5.5">{section.sub}</p>
                </motion.div>
                <div className={compact ? "space-y-2.5" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                  {sectionSources.map((source, i) => {
                    const sensor = { id: String(source.key), name: source.label, icon_url: source.customIcon };
                    const displayIcon = sensor.id === "google_workspace" || sensor.name?.toLowerCase().includes("google")
                      ? "https://cdn.simpleicons.org/googleworkspace/4285F4"
                      : sensor.icon_url;

                    return (
                      <SensorCard
                        key={source.key}
                        source={source}
                        index={si * 3 + i}
                        sensorId={sensor.id}
                        sensorName={sensor.name}
                        displayIcon={displayIcon}
                      />
                    );
                  })}
                </div>

                {section.key === "signal" && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-3 rounded-2xl border border-dashed border-border bg-transparent p-5 flex items-center justify-center"
                >
                  <p className="text-[12px] text-muted-foreground/50 font-mono">More integrations coming: Mercury · Ashby · Salesforce</p>
                </motion.div>
              )}
            </div>
          );
        })
        )}

        {/* Live Traffic Terminal */}
        {showTerminal && connectedCount >= 1 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-border bg-card p-5 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <motion.div className="h-2 w-2 rounded-full bg-success" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Live Traffic</span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {TERMINAL_LOGS.map((log, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.1 }} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-muted-foreground/40">[{log.time}]</span>
                  <span className="text-accent font-semibold">{log.source}:</span>
                  <span className="text-muted-foreground">{log.msg}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center justify-center gap-2 rounded-xl bg-secondary/50 border border-border p-4">
          <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
          <p className="text-[11px] text-muted-foreground/60">🔒 Read-only access · AES-256 encrypted · Never shared</p>
        </motion.div>
      </div>
    </div>
  );
}
