import { useState, useEffect, useRef } from "react";
import { MapPin, Layers, TrendingUp, Users, Building2, Calendar, Sparkles, ChevronDown, ArrowRight, Globe, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ── Filter Options ──
const locationOptions = [
  "San Francisco", "New York", "Los Angeles", "Austin", "Miami",
  "Boston", "Seattle", "Chicago", "Denver", "London", "Berlin", "Singapore"
];

const sectorOptions = [
  "AI / ML", "FinTech", "HealthTech", "Climate Tech", "SaaS",
  "Consumer", "Web3 / Crypto", "DevTools", "EdTech", "BioTech", "Cybersecurity", "Logistics"
];

const stageOptions = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth"
];

// ── Mock News Ticker ──
const tickerItems = [
  "🚀 3 new founders joined the SF AI/ML group this week",
  "📅 Climate Tech Meetup — Mar 28, Austin — 42 RSVPs",
  "🤝 New warm intro path discovered between FinTech founders in NYC",
  "🔥 SaaS Seed-stage group is trending — 12 new members",
  "📊 HealthTech Series A founders shared fundraising benchmarks",
  "🌐 Berlin DevTools community launched — join the conversation",
  "⚡ 5 new operator profiles verified in the Boston ecosystem",
];

// ── Mock Results Data ──
const mockConnections = [
  { name: "Sarah Chen", role: "Founder", company: "NeuralPay", matchReason: "Same sector + stage", score: 94 },
  { name: "Marcus Rivera", role: "Operator", company: "ScaleOps", matchReason: "Shared investors", score: 89 },
  { name: "Aisha Patel", role: "Founder", company: "ClimaChain", matchReason: "Geographic overlap", score: 86 },
  { name: "David Kim", role: "Founder", company: "HealthOS", matchReason: "Complementary sector", score: 82 },
];

const mockMembers = [
  { name: "Emily Zhang", type: "Founder", company: "DataMesh AI", location: "SF", stage: "Seed" },
  { name: "James Okafor", type: "Operator", company: "Vertex Partners", location: "NYC", stage: "Series A" },
  { name: "Priya Sharma", type: "Founder", company: "GreenLedger", location: "Austin", stage: "Pre-Seed" },
  { name: "Tom Erikson", type: "Operator", company: "LaunchHQ", location: "Boston", stage: "Seed" },
  { name: "Mia Johnson", type: "Founder", company: "CyberShield", location: "Miami", stage: "Series A" },
  { name: "Leo Tanaka", type: "Founder", company: "EduFlow", location: "Seattle", stage: "Pre-Seed" },
];

const mockCompanies = [
  { name: "NeuralPay", sector: "FinTech", stage: "Seed", location: "San Francisco", members: 3 },
  { name: "ClimaChain", sector: "Climate Tech", stage: "Series A", location: "Austin", members: 2 },
  { name: "HealthOS", sector: "HealthTech", stage: "Pre-Seed", location: "Boston", members: 1 },
  { name: "DataMesh AI", sector: "AI / ML", stage: "Seed", location: "San Francisco", members: 4 },
  { name: "CyberShield", sector: "Cybersecurity", stage: "Series A", location: "Miami", members: 2 },
];

const mockEvents = [
  { title: "AI Founders Dinner", date: "Mar 28, 2026", location: "San Francisco", attendees: 24, type: "Dinner" },
  { title: "Climate Tech Demo Day", date: "Apr 3, 2026", location: "Austin", attendees: 86, type: "Demo Day" },
  { title: "SaaS Metrics Workshop", date: "Apr 10, 2026", location: "Virtual", attendees: 120, type: "Workshop" },
  { title: "HealthTech Pitch Night", date: "Apr 15, 2026", location: "Boston", attendees: 45, type: "Pitch Night" },
];

// ── Filter Dropdown ──
function FilterDropdown({ label, icon: Icon, options, value, onChange }: {
  label: string;
  icon: React.ElementType;
  options: string[];
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "gap-2 text-xs font-medium h-9 border-border/60",
            value && "border-primary/40 bg-primary/5 text-primary"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {value || label}
          <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs p-3 text-muted-foreground">No results</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }} className="text-xs text-muted-foreground">
                  Clear filter
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  onSelect={() => { onChange(opt); setOpen(false); }}
                  className={cn("text-xs", value === opt && "font-semibold text-primary")}
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── News Ticker ──
function NewsTicker({ items }: { items: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [items.length]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="shrink-0 text-[10px] font-mono uppercase tracking-wider bg-primary/10 text-primary border-0">
          Live
        </Badge>
        <div className="flex-1 overflow-hidden">
          <p
            key={currentIndex}
            className="text-sm text-foreground animate-in slide-in-from-bottom-2 duration-500"
          >
            {items[currentIndex]}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === currentIndex ? "bg-primary" : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Result Tab ──
type ResultTab = "connections" | "members" | "companies" | "events";

const resultTabs: { id: ResultTab; label: string; icon: React.ElementType }[] = [
  { id: "connections", label: "Recommended Connections", icon: Sparkles },
  { id: "members", label: "Members", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "events", label: "Upcoming Events", icon: Calendar },
];

// ── Main Component ──
export function GroupsView() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [companyData, setCompanyData] = useState<{ sector: string | null; stage: string | null; location?: string | null } | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const [location, setLocation] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("connections");

  // Fetch company data
  useEffect(() => {
    if (!user) return;
    supabase.from("company_analyses").select("sector, stage").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setCompanyData(data); });
  }, [user]);

  // Apply defaults once profile + company data load
  useEffect(() => {
    if (defaultsApplied) return;
    const loc = profile?.location || null;
    const sec = companyData?.sector || null;
    const stg = companyData?.stage || null;
    if (loc || sec || stg) {
      if (loc) setLocation(loc);
      if (sec) setSector(sec);
      if (stg) setStage(stg);
      setDefaultsApplied(true);
    }
  }, [profile, companyData, defaultsApplied]);

  const hasFilters = location || sector || stage;
  const filterSummary = [location, sector, stage].filter(Boolean).join(" · ") || "All Groups";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Groups</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Discover founders, operators, and companies in your ecosystem</p>
      </div>

      {/* News Ticker */}
      <NewsTicker items={tickerItems} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={!hasFilters ? "default" : "outline"}
          size="sm"
          className="text-xs font-medium h-9"
          onClick={() => { setLocation(null); setSector(null); setStage(null); }}
        >
          All
        </Button>
        <FilterDropdown label="Location" icon={MapPin} options={locationOptions} value={location} onChange={setLocation} />
        <FilterDropdown label="Sector" icon={Layers} options={sectorOptions} value={sector} onChange={setSector} />
        <FilterDropdown label="Stage" icon={TrendingUp} options={stageOptions} value={stage} onChange={setStage} />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-9"
            onClick={() => { setLocation(null); setSector(null); setStage(null); }}
          >
            Clear all
          </Button>
        )}
        {hasFilters && (
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Showing: {filterSummary}
          </Badge>
        )}
      </div>

      {/* Result Tabs */}
      <div className="flex gap-1 border-b border-border/60 pb-0">
        {resultTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[360px]">
        {activeTab === "connections" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mockConnections.map((c) => (
              <Card key={c.name} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar className="h-10 w-10 border border-border/60">
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {c.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{c.score}% match</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.role} at {c.company}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{c.matchReason}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "members" && (
          <div className="space-y-1">
            <div className="flex gap-2 mb-3">
              <Badge variant="outline" className="text-[10px]">
                <Users className="h-3 w-3 mr-1" />
                {mockMembers.filter(m => m.type === "Founder").length} Founders
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <Briefcase className="h-3 w-3 mr-1" />
                {mockMembers.filter(m => m.type === "Operator").length} Operators
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {mockMembers.map((m) => (
                <Card key={m.name} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border/60">
                      <AvatarFallback className="text-[11px] font-semibold bg-muted text-muted-foreground">
                        {m.name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.company}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge variant={m.type === "Founder" ? "default" : "secondary"} className="text-[10px]">{m.type}</Badge>
                      <span className="text-[10px] text-muted-foreground">{m.location}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === "companies" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mockCompanies.map((c) => (
              <Card key={c.name} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.location}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{c.sector}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{c.stage}</Badge>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      <Users className="h-2.5 w-2.5 mr-1" />
                      {c.members}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "events" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mockEvents.map((e) => (
              <Card key={e.title} className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer group">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{e.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {e.date}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{e.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {e.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {e.attendees} attending
                    </span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full text-xs h-8 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    RSVP
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
