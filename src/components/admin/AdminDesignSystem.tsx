import { useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowRight, BookOpen, CircleHelp, Clock3, Code2, Component,
  Copy, Eye, Layers3, LayoutGrid, Loader2, MousePointer2, Palette, Search,
  Sparkles, Square, Type, Workflow,
} from "lucide-react";
import { AdminStickyHeader } from "@/components/admin/AdminStickyHeader";
import { AdminStickyFilters } from "@/components/admin/AdminStickyHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { COMPONENT_CATALOG, filterComponentCatalog, PATTERN_CATALOG } from "@/components/admin/designSystemCatalog";
import { AdminDesignStudioEditor } from "@/components/admin/AdminDesignStudioEditor";

const SURFACE = "rounded-xl border border-white/[0.07] bg-[#0a0a0a]";
const SOURCE_TEXT = "font-mono text-[10px] leading-relaxed text-white/35";

const COLOR_TOKENS = [
  { name: "Console canvas", value: "#050505", usage: "Admin Console shell", source: "src/pages/AdminIntelligence.tsx" },
  { name: "Console surface", value: "#0a0a0a", usage: "Admin cards and panels", source: "src/components/admin/AdminOverview.tsx" },
  { name: "Foreground", variable: "--foreground", usage: "Default text", source: "src/index.css" },
  { name: "Primary", variable: "--primary", usage: "Shared primary controls", source: "src/index.css" },
  { name: "Success / mint", variable: "--success", usage: "Positive status; Admin navigation accent", source: "src/index.css · src/pages/AdminIntelligence.tsx" },
  { name: "Warning", variable: "--warning", usage: "Caution status", source: "src/index.css" },
  { name: "Destructive", variable: "--destructive", usage: "Destructive actions and errors", source: "src/index.css" },
  { name: "Background", variable: "--background", usage: "Shared app canvas", source: "src/index.css" },
  { name: "Card", variable: "--card", usage: "Shared card and popover surface", source: "src/index.css" },
  { name: "Muted foreground", variable: "--muted-foreground", usage: "Secondary labels and helper text", source: "src/index.css" },
  { name: "Border", variable: "--border", usage: "Shared separators and outlines", source: "src/index.css" },
];

const TYPE_TOKENS = [
  { name: "Sans family", variable: "--font-sans", usage: "Application text · Geist with Inter fallback" },
  { name: "Mono family", variable: "font-mono", usage: "Code, token values, and compact diagnostics" },
  { name: "2xs", variable: "--text-2xs", usage: "12px reference" },
  { name: "xs", variable: "--text-xs", usage: "13px reference" },
  { name: "sm", variable: "--text-sm", usage: "14px reference" },
  { name: "md", variable: "--text-md", usage: "16px reference" },
  { name: "lg", variable: "--text-lg", usage: "18px reference" },
  { name: "2xl", variable: "--text-2xl", usage: "24px reference" },
  { name: "Line height · sm", variable: "--lh-sm", usage: "Compact body copy" },
  { name: "Line height · md", variable: "--lh-md", usage: "Default paragraph rhythm" },
];

const SPACING_TOKENS = [
  { token: "1", value: "0.25rem", className: "w-1" },
  { token: "2", value: "0.5rem", className: "w-2" },
  { token: "3", value: "0.75rem", className: "w-3" },
  { token: "4", value: "1rem", className: "w-4" },
  { token: "6", value: "1.5rem", className: "w-6" },
  { token: "8", value: "2rem", className: "w-8" },
  { token: "12", value: "3rem", className: "w-12" },
];

const RADIUS_TOKENS = [
  { name: "Shared radius", value: "var(--radius)", style: { borderRadius: "var(--radius)" } },
  { name: "Small", value: "calc(var(--radius) - 4px)", style: { borderRadius: "calc(var(--radius) - 4px)" } },
  { name: "Medium", value: "calc(var(--radius) - 2px)", style: { borderRadius: "calc(var(--radius) - 2px)" } },
  { name: "Large", value: "var(--radius)", style: { borderRadius: "var(--radius)" } },
  { name: "Pill", value: "9999px", style: { borderRadius: "9999px" } },
];

const SHADOW_TOKENS = [
  { name: "Surface", variable: "--shadow-sm", usage: "Hairline and low lift" },
  { name: "Surface medium", variable: "--shadow-md", usage: "Raised popovers and menus" },
  { name: "Surface large", variable: "--shadow-lg", usage: "Dialogs and high elevation" },
];

const MOTION_NOTES = [
  { name: "Control transition", value: "transition-colors · duration-200", usage: "Hover, focus, and state changes in shared controls." },
  { name: "Status pulse", value: "animate-ping", usage: "Admin system indicator; communicates a live state." },
  { name: "Onboarding pulse", value: "2.8s ease-in-out", usage: "Disabled when prefers-reduced-motion is enabled." },
  { name: "Referral pulse", value: "2.75s / 3.25s ease-in-out", usage: "Both referral animations disable for reduced motion." },
  { name: "Loading dots", value: "1.4s ease-in-out", usage: "Shared BouncingDots indicator; CSS keyframes are local to the component." },
];

function cssVariableValue(variable: string) {
  if (variable === "font-mono") return "'Geist Mono', 'SF Mono', 'Fira Code', monospace";
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "Not defined";
}

function resolvedColor(token: (typeof COLOR_TOKENS)[number]) {
  if (token.value) return token.value;
  const value = cssVariableValue(token.variable!);
  return value === "Not defined" ? "transparent" : `hsl(${value})`;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-white/90">{title}</h2>
      <p className="max-w-3xl text-[12px] leading-relaxed text-white/45">{description}</p>
    </div>
  );
}

function Source({ children }: { children: ReactNode }) {
  return <p className={SOURCE_TEXT}>{children}</p>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Card className={`${SURFACE} shadow-none ${className}`}>{children}</Card>;
}

function Overview({ currentTheme, onOpen }: { currentTheme: string; onOpen: (section: string) => void }) {
  const metrics = [
    { label: "Component previews", value: COMPONENT_CATALOG.length, icon: Component },
    { label: "Documented patterns", value: PATTERN_CATALOG.length, icon: Workflow },
    { label: "Theme modes", value: 2, icon: Eye },
    { label: "Current reference", value: "v0", icon: Clock3 },
  ];

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden">
        <div className="border-b border-white/[0.06] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-300"><Palette className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-semibold text-white/90">Vekta design foundations</h2>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/50">A read-only index of the tokens, shared components, and admin patterns that shape the app.</p>
              </div>
            </div>
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-white/65">{currentTheme} theme</Badge>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.04] text-white/55"><Icon className="h-4 w-4" /></span>
                <div><p className="text-lg font-semibold leading-none text-white/90">{value}</p><p className="mt-1 text-[11px] text-white/40">{label}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <button type="button" onClick={() => onOpen("foundations")} className="group rounded-lg border border-white/[0.07] bg-black/20 p-4 text-left transition-colors hover:border-emerald-300/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium text-white/80"><Layers3 className="h-4 w-4 text-emerald-300" />Explore foundations</span><ArrowRight className="h-4 w-4 text-white/30 transition-colors group-hover:text-emerald-300" /></div>
            <p className="mt-2 text-xs leading-relaxed text-white/40">Inspect colors, type, spacing, radius, elevation, and icon conventions.</p>
          </button>
          <button type="button" onClick={() => onOpen("components")} className="group rounded-lg border border-white/[0.07] bg-black/20 p-4 text-left transition-colors hover:border-emerald-300/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium text-white/80"><LayoutGrid className="h-4 w-4 text-emerald-300" />Browse components</span><ArrowRight className="h-4 w-4 text-white/30 transition-colors group-hover:text-emerald-300" /></div>
            <p className="mt-2 text-xs leading-relaxed text-white/40">Search the live previews of shared shadcn and Radix components.</p>
          </button>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_1.4fr]">
        <Panel>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-semibold text-white/85">Foundations at a glance</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-4 pt-2">
            <FoundationPeek icon={<Palette className="h-4 w-4" />} title="Colors" detail="Semantic CSS variables" />
            <FoundationPeek icon={<Type className="h-4 w-4" />} title="Typography" detail="Geist · Inter fallback" />
            <FoundationPeek icon={<Square className="h-4 w-4" />} title="Spacing & radius" detail="Tailwind + CSS tokens" />
            <FoundationPeek icon={<Layers3 className="h-4 w-4" />} title="Elevation" detail="Three shadow levels" />
          </CardContent>
        </Panel>
        <Panel>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-semibold text-white/85">Live component preview</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2.5 p-4 pt-2">
            <Button size="sm">Primary action</Button>
            <Button size="sm" variant="outline">Secondary</Button>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Input aria-label="Preview search" placeholder="Search components" className="h-9 max-w-48 bg-black/30" />
          </CardContent>
        </Panel>
      </div>

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-white/45" /><p className="text-xs leading-relaxed text-white/50">Token inspection is live and read-only. This console has no persisted theme editor, publish workflow, or rollback history.</p></div>
        <Source>Sources: DESIGN.md · src/index.css · tailwind.config.ts</Source>
      </Panel>
    </div>
  );
}

function FoundationPeek({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3"><div className="flex items-center gap-2 text-white/65">{icon}<span className="text-xs font-medium">{title}</span></div><p className="mt-1.5 text-[10px] text-white/35">{detail}</p></div>;
}

function Foundations() {
  const colors = useMemo(() => COLOR_TOKENS.map((token) => ({ ...token, resolved: resolvedColor(token), shown: token.value || cssVariableValue(token.variable!) })), []);
  return (
    <div className="space-y-6">
      <SectionHeading title="Foundations" description="Values resolve from the active CSS theme where a shared variable exists. Admin-only values identify their current source file." />

      <Panel>
        <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Palette className="h-4 w-4 text-emerald-300" /><CardTitle className="text-sm font-semibold text-white/85">Color tokens</CardTitle></div></CardHeader>
        <CardContent className="grid gap-2 p-4 pt-0 sm:grid-cols-2 xl:grid-cols-3">
          {colors.map((token) => (
            <div key={token.name} className="flex min-w-0 items-center gap-3 rounded-md border border-white/[0.06] bg-black/20 p-3">
              <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md border border-white/15" style={{ background: token.resolved }} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-x-2"><p className="text-xs font-medium text-white/75">{token.name}</p><code className="font-mono text-[10px] text-white/45">{token.shown}</code></div><p className="mt-1 text-[10px] text-white/40">{token.usage}</p><Source>{token.source || `var(${token.variable}) · src/index.css`}</Source></div>
            </div>
          ))}
        </CardContent>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Type className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Typography</CardTitle></div></CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {TYPE_TOKENS.map((token) => {
              const value = cssVariableValue(token.variable);
              return <div key={token.name} className="grid gap-1 rounded-md border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-xs font-medium text-white/75">{token.name}</p><p className="text-[10px] text-white/40">{token.usage}</p></div><code className="break-all font-mono text-[10px] text-white/55">{value}</code></div>;
            })}
            <Source>src/index.css · tailwind.config.ts</Source>
          </CardContent>
        </Panel>

        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Spacing scale</CardTitle></div></CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <p className="text-[11px] text-white/40">Tailwind’s default rem-based spacing utilities used throughout the app.</p>
            {SPACING_TOKENS.map((token) => <div key={token.token} className="grid grid-cols-[38px_1fr_72px] items-center gap-3"><code className="font-mono text-[10px] text-white/60">{token.token}</code><span className="h-2 rounded-sm bg-emerald-300/80" style={{ width: `calc(${token.value} * 2)` }} /><code className="text-right font-mono text-[10px] text-white/45">{token.value}</code></div>)}
            <Source>tailwind.config.ts · default spacing scale</Source>
          </CardContent>
        </Panel>

        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Square className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Border radius</CardTitle></div></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-3 xl:grid-cols-5">
            {RADIUS_TOKENS.map((token) => <div key={token.name} className="flex flex-col items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 p-3"><span className="h-10 w-full border border-emerald-300/55 bg-emerald-300/10" style={token.style} /><p className="text-center text-[10px] font-medium text-white/65">{token.name}</p><code className="text-center font-mono text-[9px] text-white/35">{token.value}</code></div>)}
            <div className="col-span-full"><Source>--radius is shared by shadcn primitives; Tailwind radius utilities remain available in tailwind.config.ts.</Source></div>
          </CardContent>
        </Panel>

        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Elevation & borders</CardTitle></div></CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
            <div className="space-y-2">{SHADOW_TOKENS.map((token) => <div key={token.name} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/20 p-3"><div><p className="text-xs font-medium text-white/70">{token.name}</p><p className="text-[10px] text-white/40">{token.usage}</p></div><span aria-hidden="true" className="h-8 w-8 rounded-md bg-[#0a0a0a]" style={{ boxShadow: `var(${token.variable})` }} /></div>)}</div>
            <div className="space-y-2"><div className="rounded-md border border-white/[0.06] bg-black/20 p-3"><p className="text-xs font-medium text-white/70">Border color</p><p className="mt-1 font-mono text-[10px] text-white/45">hsl({cssVariableValue("--border")})</p><p className="mt-1 text-[10px] text-white/35">var(--border) · 1px solid</p></div><div className="rounded-md border border-white/[0.06] bg-black/20 p-3"><p className="text-xs font-medium text-white/70">Input border</p><p className="mt-1 font-mono text-[10px] text-white/45">hsl({cssVariableValue("--input")})</p><p className="mt-1 text-[10px] text-white/35">var(--input) · focus uses var(--ring)</p></div></div>
            <div className="sm:col-span-2"><Source>src/index.css · tailwind.config.ts</Source></div>
          </CardContent>
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="flex items-start gap-3"><Code2 className="mt-0.5 h-4 w-4 shrink-0 text-white/50" /><div><h3 className="text-xs font-semibold text-white/75">Icon conventions</h3><p className="mt-1 text-[11px] leading-relaxed text-white/45">Lucide React is the shared icon library. Controls generally use 16px icons; decorative icons are hidden from assistive technology, and icon-only buttons need an accessible label.</p><Source>src/components/ui · lucide-react</Source></div></div>
      </Panel>
    </div>
  );
}

function Components() {
  const [query, setQuery] = useState("");
  const filtered = filterComponentCatalog(query);
  return (
    <div className="space-y-5">
      <SectionHeading title="Components" description="Search real shared React primitives. Each preview uses the component imported by the application, so interactions, states, and supported variants stay accurate." />
      <AdminStickyFilters className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-white/40">{filtered.length} of {COMPONENT_CATALOG.length} preview groups</p>
        <div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" /><Input aria-label="Search components" placeholder="Search components…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 border-white/10 bg-[#0a0a0a] pl-9 text-xs text-white/80" /></div>
      </AdminStickyFilters>
      {filtered.length ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map((entry) => <Panel key={entry.id} className="min-w-0 overflow-hidden"><CardHeader className="p-4 pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-sm font-semibold text-white/85">{entry.name}</CardTitle><p className="mt-1 text-[11px] leading-relaxed text-white/45">{entry.description}</p></div><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`${entry.name} source information`} className="rounded-md p-1 text-white/35 hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"><CircleHelp className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>{entry.variants}</TooltipContent></Tooltip></div></CardHeader><CardContent className="space-y-3 p-4 pt-0"><div className="flex min-h-[96px] flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-black/30 p-4">{renderComponentPreview(entry.id)}</div><p className="text-[10px] text-white/45">{entry.variants}</p><Source>{entry.source}</Source></CardContent></Panel>)}</div> : <Panel className="px-5 py-12 text-center"><Search className="mx-auto h-5 w-5 text-white/30" /><p className="mt-2 text-sm font-medium text-white/70">No components match “{query}”</p><p className="mt-1 text-xs text-white/40">Try a component name, variant, or source file.</p></Panel>}
    </div>
  );
}

function renderComponentPreview(id: string) {
  switch (id) {
    case "button": return <><Button size="sm">Default</Button><Button size="sm" variant="secondary">Secondary</Button><Button size="sm" variant="outline">Outline</Button><Button size="sm" variant="ghost">Ghost</Button><Button size="sm" variant="destructive">Destructive</Button></>;
    case "badge": return <><Badge>Default</Badge><Badge variant="success">Success</Badge><Badge variant="warning">Warning</Badge><Badge variant="destructive">Destructive</Badge><Badge variant="outline">Outline</Badge></>;
    case "card": return <Card className="w-full max-w-xs border-white/10 bg-[#111] text-white/80 shadow-none"><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Card title</CardTitle></CardHeader><CardContent className="p-3 pt-1 text-xs text-white/45">Shared surface with optional header and content.</CardContent></Card>;
    case "form-controls": return <div className="grid w-full gap-3 sm:grid-cols-2"><Input aria-label="Text input preview" placeholder="Input" className="h-9 bg-[#111] text-xs" /><Select defaultValue="active"><SelectTrigger aria-label="Select preview" className="h-9 bg-[#111] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectContent></Select><Textarea aria-label="Textarea preview" placeholder="Textarea" className="min-h-16 bg-[#111] text-xs" /><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-xs text-white/65"><Checkbox aria-label="Checkbox preview" defaultChecked />Checkbox</label><label className="flex items-center gap-2 text-xs text-white/65"><Switch aria-label="Switch preview" defaultChecked />Switch</label><RadioGroup aria-label="Radio preview" defaultValue="one" className="flex gap-3"><label className="flex items-center gap-2 text-xs text-white/65"><RadioGroupItem value="one" />Radio</label><label className="flex items-center gap-2 text-xs text-white/65"><RadioGroupItem value="two" />Alt</label></RadioGroup></div></div>;
    case "tabs": return <Tabs defaultValue="activity" className="w-full"><TabsList><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList><TabsContent value="activity" className="pt-2 text-xs text-white/55">Activity view</TabsContent><TabsContent value="settings" className="pt-2 text-xs text-white/55">Settings view</TabsContent></Tabs>;
    case "table": return <Table><TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="h-8 px-2 text-[10px]">Name</TableHead><TableHead className="h-8 px-2 text-[10px]">Status</TableHead></TableRow></TableHeader><TableBody><TableRow className="border-white/10"><TableCell className="p-2 text-xs">Example record</TableCell><TableCell className="p-2"><Badge variant="success">Active</Badge></TableCell></TableRow></TableBody></Table>;
    case "dropdown": return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm">Open menu</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem>Preview action</DropdownMenuItem><DropdownMenuItem>Another action</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
    case "dialog": return <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">Open dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Dialog preview</DialogTitle><DialogDescription>This is the shared modal primitive.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button size="sm">Done</Button></DialogClose></DialogFooter></DialogContent></Dialog>;
    case "tooltip": return <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm">Hover or focus</Button></TooltipTrigger><TooltipContent>Short contextual help</TooltipContent></Tooltip>;
    case "progress": return <div className="w-full max-w-xs space-y-2"><div className="flex justify-between text-xs text-white/60"><span>Completion</span><span>68%</span></div><Progress aria-label="Completion preview" value={68} className="h-2" /></div>;
    case "skeleton": return <div className="flex w-full max-w-xs items-center gap-3"><Skeleton className="h-10 w-10 rounded-md" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>;
    case "navigation": return <NavigationPreview />;
    case "loading": return <div className="flex items-center gap-3"><BouncingDots aria-label="Loading preview" /><span className="text-xs text-white/50">Loading</span></div>;
    default: return null;
  }
}

function NavigationPreview() {
  const [selected, setSelected] = useState("Overview");
  return <nav aria-label="Navigation component preview" className="flex flex-wrap gap-1">{["Overview", "Analytics", "Users"].map((item) => <button key={item} type="button" aria-current={selected === item ? "page" : undefined} onClick={() => setSelected(item)} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${selected === item ? "bg-emerald-300/[0.08] text-emerald-300" : "text-white/45 hover:text-white/75"}`}><Activity className="h-3.5 w-3.5" />{item}</button>)}</nav>;
}

function Patterns() {
  return (
    <div className="space-y-5">
      <SectionHeading title="Patterns" description="Small, reusable arrangements documented from the current admin and app UI. Previews compose the same shared primitives used elsewhere." />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PatternCard name="Page header" description="Sticky title and context with optional collapse control." source="src/components/admin/AdminStickyHeader.tsx"><div className="w-full rounded-md border border-white/[0.06] bg-[#050505]"><div className="border-b border-white/[0.06] px-3 py-2"><p className="text-xs font-semibold text-white/80">Records</p><p className="text-[10px] text-white/40">Review recent changes</p></div><div className="p-3 text-[10px] text-white/35">Scrollable content continues below.</div></div></PatternCard>
        <PatternCard name="Dashboard metrics" description="One label, one value, and one meaning per metric." source="src/components/admin/AdminOverview.tsx"><div className="grid w-full grid-cols-2 gap-2"><MetricPreview label="Count" value="—" /><MetricPreview label="Rate" value="—" /></div></PatternCard>
        <PatternCard name="Search and filters" description="Keep search and filters together and close to the records they control." source="src/components/admin/AdminReviews.tsx"><div className="flex w-full flex-wrap items-center gap-2"><Input aria-label="Pattern search" placeholder="Search records" className="h-9 min-w-36 flex-1 bg-black/30 text-xs" /><Select defaultValue="all"><SelectTrigger aria-label="Filter status" className="h-9 w-32 bg-black/30 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem></SelectContent></Select><Button variant="outline" size="sm">Filter</Button></div></PatternCard>
        <PatternCard name="Data table with actions" description="Status and row actions stay aligned with their record." source="src/components/admin/AdminReviews.tsx"><Table><TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="h-8 px-2 text-[10px]">Record</TableHead><TableHead className="h-8 px-2 text-[10px]">Status</TableHead><TableHead className="h-8 px-2 text-[10px]">Action</TableHead></TableRow></TableHeader><TableBody><TableRow className="border-white/10"><TableCell className="p-2 text-xs">Example row</TableCell><TableCell className="p-2"><Badge variant="muted">Draft</Badge></TableCell><TableCell className="p-2"><Button variant="ghost" size="sm">Review</Button></TableCell></TableRow></TableBody></Table></PatternCard>
        <PatternCard name="Detail dialog" description="A focused overlay carries secondary record context and confirmation." source="src/components/admin/AdminLiveRecordDialog.tsx"><div className="flex w-full items-center justify-between rounded-md border border-white/[0.06] bg-black/20 p-3"><div><p className="text-xs font-medium text-white/75">Example record</p><p className="text-[10px] text-white/40">Record details live in a dialog.</p></div><Dialog><DialogTrigger asChild><Button variant="outline" size="sm">View</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Record details</DialogTitle><DialogDescription>A shared dialog preview with a focused action.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button size="sm">Close</Button></DialogClose></DialogFooter></DialogContent></Dialog></div></PatternCard>
        <PatternCard name="Loading and empty states" description="Explain what is happening and what action can resolve an empty result." source="src/components/admin/AdminOnboarding.tsx"><div className="flex min-h-24 w-full flex-col items-center justify-center rounded-md border border-dashed border-white/10 px-4 py-5 text-center"><Sparkles className="h-4 w-4 text-white/35" /><p className="mt-2 text-xs font-medium text-white/65">Nothing to review yet</p><p className="mt-1 text-[10px] text-white/40">New records will appear here.</p></div></PatternCard>
      </div>
    </div>
  );
}

function PatternCard({ name, description, source, children }: { name: string; description: string; source: string; children: ReactNode }) {
  return <Panel className="min-w-0"><CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-semibold text-white/85">{name}</CardTitle><p className="text-[11px] leading-relaxed text-white/45">{description}</p></CardHeader><CardContent className="space-y-3 p-4 pt-2"><div className="flex min-h-24 items-center rounded-lg border border-white/[0.06] bg-black/20 p-3">{children}</div><Source>{source}</Source></CardContent></Panel>;
}

function MetricPreview({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white/[0.06] bg-[#0a0a0a] p-3"><p className="text-[9px] uppercase tracking-wider text-white/35">{label}</p><p className="mt-1 font-mono text-lg font-semibold text-emerald-300">{value}</p></div>;
}

function Motion() {
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="space-y-6">
      <SectionHeading title="Motion" description="Existing motion is tied to interaction or status. Custom CSS animations document reduced-motion behavior where implemented." />
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><MousePointer2 className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Motion conventions</CardTitle></div></CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">{MOTION_NOTES.map((note) => <div key={note.name} className="grid gap-1 rounded-md border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-[190px_1fr]"><div><p className="text-xs font-medium text-white/70">{note.name}</p><code className="font-mono text-[10px] text-white/40">{note.value}</code></div><p className="text-[11px] leading-relaxed text-white/45">{note.usage}</p></div>)}<Source>tailwind.config.ts · src/index.css · src/components/ui</Source></CardContent>
        </Panel>
        <Panel>
          <CardHeader className="p-4 pb-3"><div className="flex items-center gap-2"><Loader2 className="h-4 w-4 text-white/55" /><CardTitle className="text-sm font-semibold text-white/85">Live loading preview</CardTitle></div></CardHeader>
          <CardContent className="space-y-4 p-4 pt-0"><div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-black/20 p-4"><BouncingDots /><span className="text-xs text-white/50">Shared loading indicator</span></div><div className="space-y-2"><div className="flex justify-between text-[11px] text-white/45"><span>Progress transition</span><span>56%</span></div><Progress value={56} aria-label="Motion preview progress" className="h-2" /></div><div className="rounded-md border border-white/[0.06] bg-black/20 p-3"><p className="text-xs font-medium text-white/70">Reduced motion preference</p><p className="mt-1 text-[11px] text-white/45">{reducedMotion ? "This browser requests reduced motion." : "This browser does not request reduced motion."}</p></div></CardContent>
        </Panel>
      </div>
      <Panel className="p-4"><p className="text-[11px] leading-relaxed text-white/45">A reduced-motion preference is respected by onboarding, referral, home-mark, and health-metric animations. Keep animation purposeful, and preserve a non-animated status cue when motion is disabled.</p></Panel>
    </div>
  );
}

function Versions() {
  return (
    <div className="space-y-5">
      <SectionHeading title="Versions" description="Current-state visibility only. No theme revision history is configured in this application." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-mono uppercase tracking-wider text-white/35">Current design reference</p><h3 className="mt-2 text-2xl font-semibold text-white/90">v0</h3><p className="mt-2 text-xs leading-relaxed text-white/50">The repository’s documented direction for shared tokens and typography.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-300"><BookOpen className="h-5 w-5" /></span></div><div className="mt-5 space-y-1"><Source>DESIGN.md</Source><Source>docs/design-systems/v0.design.md</Source></div></Panel>
        <Panel className="p-5"><p className="text-[10px] font-mono uppercase tracking-wider text-white/35">Theme state</p><h3 className="mt-2 text-base font-semibold text-white/85">Current browser theme</h3><p className="mt-1 text-xs text-white/50">{document.documentElement.classList.contains("light") ? "Light" : "Dark"} · shared CSS variables</p><div className="mt-4 rounded-md border border-white/[0.06] bg-black/20 p-3"><p className="text-xs font-medium text-white/70">Version history unavailable</p><p className="mt-1 text-[11px] leading-relaxed text-white/40">There are no persisted design revisions or publishing APIs. Publish and rollback controls are not available.</p></div></Panel>
      </div>
      <Panel className="p-4"><div className="flex items-start gap-2.5"><Copy className="mt-0.5 h-4 w-4 shrink-0 text-white/45" /><p className="text-[11px] leading-relaxed text-white/45">The tokens shown here resolve from the current CSS variables and Tailwind utilities. Change them at their source in code; this page does not create draft overrides.</p></div></Panel>
    </div>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "foundations", label: "Foundations", icon: Layers3 },
  { id: "components", label: "Components", icon: LayoutGrid },
  { id: "patterns", label: "Patterns", icon: Workflow },
  { id: "motion", label: "Motion", icon: MousePointer2 },
  { id: "versions", label: "Versions", icon: Clock3 },
] as const;

export function AdminDesignSystem() {
  return <AdminDesignStudioEditor />;
}
