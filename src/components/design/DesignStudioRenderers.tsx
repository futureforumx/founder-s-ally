import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePublishedDesignConfig } from "@/lib/designStudioRuntime";
import type { DesignStudioConfig } from "@/components/admin/designStudioConfig";

const data = [{ name: "Jan", value: 18, secondary: 12 }, { name: "Feb", value: 31, secondary: 20 }, { name: "Mar", value: 24, secondary: 27 }, { name: "Apr", value: 46, secondary: 32 }, { name: "May", value: 39, secondary: 29 }, { name: "Jun", value: 62, secondary: 41 }];
const palette = ["#29e3a6", "#8b72f8", "#63a7ff", "#f4bf50", "#ff7f88"];

export function DesignVisualizationPreview({ preset, light = false }: { preset: DesignStudioConfig["visualizations"][number]; light?: boolean }) {
  const stroke = light ? "#737373" : "#71717a";
  if (preset.type === "kpi") return <div className="flex h-full w-full flex-col justify-center"><p className={`text-[11px] ${light ? "text-zinc-500" : "text-white/40"}`}>{preset.title}</p><p className="mt-1 text-3xl font-semibold" style={{ color: preset.color }}>62</p><p className={`mt-1 text-[10px] ${light ? "text-zinc-500" : "text-white/35"}`}>Sample preview · not live data</p></div>;
  if (preset.type === "pie" || preset.type === "donut") return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.slice(0, 5)} dataKey={preset.yAxisKey} nameKey={preset.xAxisKey} innerRadius={preset.type === "donut" ? "48%" : 0} outerRadius="74%" paddingAngle={2} label={preset.showLabels}>{data.slice(0, 5).map((row, index) => <Cell key={row.name} fill={index === 0 ? preset.color : palette[index]} />)}</Pie>{preset.showTooltip && <Tooltip />}{preset.showLegend && <Legend />}</PieChart></ResponsiveContainer>;
  const chartProps = { data, margin: { top: 8, right: 12, bottom: 0, left: -18 } };
  const axes = <><CartesianGrid vertical={false} stroke={preset.showGrid ? (light ? "#e4e4e7" : "#ffffff12") : "transparent"} /><XAxis dataKey={preset.xAxisKey} tick={{ fill: stroke, fontSize: 10 }} axisLine={false} tickLine={false}><Label value={preset.xAxisLabel} position="insideBottom" offset={-2} fill={stroke} fontSize={10} /></XAxis><YAxis dataKey={preset.yAxisKey} tick={{ fill: stroke, fontSize: 10 }} axisLine={false} tickLine={false}><Label value={preset.yAxisLabel} position="insideLeft" angle={-90} fill={stroke} fontSize={10} /></YAxis>{preset.showTooltip && <Tooltip contentStyle={{ background: light ? "#fff" : "#111", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />}{preset.showLegend && <Legend />}</>;
  if (preset.type === "line") return <ResponsiveContainer width="100%" height="100%"><LineChart {...chartProps}>{axes}<Line type="monotone" dataKey={preset.yAxisKey} stroke={preset.color} strokeWidth={2.5} dot={false} />{preset.showLegend && <Line type="monotone" dataKey="secondary" stroke={palette[1]} strokeWidth={2} dot={false} />}</LineChart></ResponsiveContainer>;
  if (preset.type === "area") return <ResponsiveContainer width="100%" height="100%"><AreaChart {...chartProps}>{axes}<Area type="monotone" dataKey={preset.yAxisKey} stroke={preset.color} fill={preset.color} fillOpacity={0.18} strokeWidth={2} />{preset.showLegend && <Area type="monotone" dataKey="secondary" stroke={palette[1]} fill={palette[1]} fillOpacity={0.08} />}</AreaChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%"><BarChart {...chartProps}>{axes}<Bar dataKey={preset.yAxisKey} fill={preset.color} radius={[4, 4, 0, 0]} />{preset.showLegend && <Bar dataKey="secondary" fill={palette[1]} radius={[4, 4, 0, 0]} />}</BarChart></ResponsiveContainer>;
}

/** Shared stable-ID renderer for published chart presets. */
export function DesignVisualization({ presetId, className = "h-64" }: { presetId: string; className?: string }) {
  const config = usePublishedDesignConfig();
  const preset = config.visualizations.find((item) => item.id === presetId);
  if (!preset) return <div className={`flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground ${className}`}>Visualization preset unavailable</div>;
  return <section aria-label={preset.title} className={className}><h3 className="sr-only">{preset.title}</h3><DesignVisualizationPreview preset={preset} /></section>;
}

/** Shared stable-ID renderer restricted to Vekta's registered primitives. */
export function DesignComponentPreset({ presetId }: { presetId: string }) {
  const config = usePublishedDesignConfig();
  const preset = config.componentPresets.find((item) => item.id === presetId);
  if (!preset) return null;
  return <DesignComponentPreview preset={preset} />;
}

export function DesignComponentPreview({ preset }: { preset: DesignStudioConfig["componentPresets"][number] }) {
  if (preset.component === "badge") return <Badge variant={preset.variant as "default" | "success" | "warning" | "outline" | "destructive"}>{preset.name}</Badge>;
  if (preset.component === "card") return <Card className="border-border bg-card p-4 text-card-foreground" style={{ borderRadius: preset.radius === "lg" ? 16 : preset.radius === "sm" ? 6 : 10 }}><p className="text-xs text-muted-foreground">{preset.name}</p><p className="mt-2 text-2xl font-semibold">24</p></Card>;
  return <Button size={preset.size as "default" | "sm" | "lg"} variant={preset.variant as "default" | "secondary" | "outline" | "ghost" | "destructive"}>{preset.name}</Button>;
}

/** Fixed template renderer for published patterns; stored settings cannot inject markup. */
export function DesignPatternPreset({ presetId }: { presetId: string }) {
  const config = usePublishedDesignConfig();
  const preset = config.patterns.find((item) => item.id === presetId);
  if (!preset) return null;
  return <DesignPatternPreview preset={preset} />;
}

export function DesignPatternPreview({ preset }: { preset: DesignStudioConfig["patterns"][number] }) {
  const compact = preset.density === "compact";
  return <section className="rounded-lg border border-border bg-card" style={{ padding: compact ? 12 : 20 }}>
    {preset.template === "page-header" && <><h2 className="text-lg font-semibold">{preset.name}</h2><p className="mt-1 text-sm text-muted-foreground">Company overview and recent activity</p></>}
    {preset.template === "search-filters" && <div className="flex flex-wrap items-center gap-2"><input aria-label="Search records" className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-3 text-sm" placeholder="Search records" /><Button variant="outline" size="sm">Filter</Button></div>}
    {preset.template === "metric-grid" && <div className="grid grid-cols-2 gap-2"><div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Companies</p><strong>24</strong></div><div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">New this month</p><strong>8</strong></div></div>}
    {preset.template === "empty-state" && <div className="py-4 text-center"><Sparkles aria-hidden="true" className="mx-auto h-4 w-4 text-emerald-300" /><p className="mt-2 text-sm">{preset.name}</p><p className="mt-1 text-xs text-muted-foreground">Nothing to review yet.</p></div>}
  </section>;
}
