import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Building2, ExternalLink, Globe, MapPin } from "lucide-react";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { fetchVCFirmDetail, type VCFirmDetail, type VcFundRow } from "@/lib/vcFirmDetail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function fmtUsd(n: unknown): string {
  if (n == null || typeof n !== "number") return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(iso: unknown): string {
  if (iso == null || typeof iso !== "string") return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function scoreBadges(firm: VCFirmDetail) {
  const pairs: [string, unknown][] = [
    ["Match", firm.match_score],
    ["Reputation", firm.reputation_score],
    ["Founder sentiment", firm.founder_sentiment],
    ["Responsiveness", firm.responsiveness_score],
  ];
  return pairs.filter(([, v]) => typeof v === "number");
}

const FirmProfile = () => {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ["vc-firm-detail", id],
    queryFn: () => fetchVCFirmDetail(supabase, id!),
    enabled: Boolean(id && isSupabaseConfigured),
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Supabase not configured</CardTitle>
            <CardDescription>
              Set <code className="text-xs">VITE_SUPABASE_URL</code> and{" "}
              <code className="text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> to the project that contains your Prisma{" "}
              <code className="text-xs">vc_*</code> tables. The mock client cannot load firm profiles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to app</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Missing firm id.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/">Home</Link>
        </Button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading firm…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle>Could not load firm</CardTitle>
            <CardDescription>
              {(query.error as Error).message}. If you see a policy or permission error, add RLS <code className="text-xs">SELECT</code>{" "}
              policies for <code className="text-xs">vc_*</code> tables for the <code className="text-xs">authenticated</code> role.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/">Back</Link>
            </Button>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const firm = query.data;
  if (!firm) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Firm not found</CardTitle>
            <CardDescription>
              No active <code className="text-xs">vc_firms</code> row for this id. Open Prisma Studio and copy an id from the seed data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to app</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const website = typeof firm.website_url === "string" ? firm.website_url : null;
  const hq = [firm.hq_city, firm.hq_state, firm.hq_country].filter(Boolean).join(", ");
  const funds = [...(firm.vc_funds ?? [])].sort((a, b) =>
    String(a.fund_name ?? "").localeCompare(String(b.fund_name ?? "")),
  );
  const people = [...(firm.vc_people ?? [])].sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
  );
  const investments = [...(firm.vc_investments ?? [])].sort((a, b) => {
    const da = a.investment_date ? String(a.investment_date) : "";
    const db = b.investment_date ? String(b.investment_date) : "";
    return db.localeCompare(da);
  });
  const signals = [...(firm.vc_signals ?? [])].sort((a, b) => {
    const da = a.signal_date ? String(a.signal_date) : "";
    const db = b.signal_date ? String(b.signal_date) : "";
    return db.localeCompare(da);
  });
  const sources = [...(firm.vc_source_links ?? [])].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const snapshots = [...(firm.vc_score_snapshots ?? [])].sort((a, b) => {
    const da = a.computed_at ? String(a.computed_at) : "";
    const db = b.computed_at ? String(b.computed_at) : "";
    return db.localeCompare(da);
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/30">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:flex-row md:items-start md:justify-between md:px-8">
          <div className="flex flex-1 gap-4">
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to="/" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex gap-4">
              {typeof firm.logo_url === "string" && firm.logo_url ? (
                <img
                  src={firm.logo_url}
                  alt=""
                  className="h-16 w-16 rounded-lg border bg-background object-contain p-1"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{String(firm.firm_name)}</h1>
                {typeof firm.elevator_pitch === "string" && firm.elevator_pitch ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{firm.elevator_pitch}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {typeof firm.firm_type === "string" ? (
                    <Badge variant="secondary">{firm.firm_type.replace(/_/g, " ")}</Badge>
                  ) : null}
                  {hq ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {hq}
                    </span>
                  ) : null}
                  {website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline",
                      )}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {scoreBadges(firm).map(([label, v]) => (
              <Badge key={label} variant="outline" className="font-normal">
                {label}: {v as number}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        {typeof firm.description === "string" && firm.description ? (
          <>
            <Card className="mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{firm.description}</p>
              </CardContent>
            </Card>
            <Separator className="mb-8" />
          </>
        ) : null}

        <Tabs defaultValue="funds" className="w-full">
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="funds">Funds ({funds.length})</TabsTrigger>
            <TabsTrigger value="people">People ({people.length})</TabsTrigger>
            <TabsTrigger value="investments">Investments ({investments.length})</TabsTrigger>
            <TabsTrigger value="signals">Signals ({signals.length})</TabsTrigger>
            <TabsTrigger value="sources">Sources ({sources.length})</TabsTrigger>
            <TabsTrigger value="scores">Scores ({snapshots.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="funds" className="space-y-3">
            {funds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No funds.</p>
            ) : (
              funds.map((f: VcFundRow) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{String(f.fund_name ?? "Fund")}</CardTitle>
                      <div className="flex flex-wrap gap-1">
                        {f.fund_status ? <Badge variant="outline">{String(f.fund_status)}</Badge> : null}
                        {f.fund_type ? <Badge variant="secondary">{String(f.fund_type).replace(/_/g, " ")}</Badge> : null}
                        {f.actively_deploying === true ? <Badge>Deploying</Badge> : null}
                      </div>
                    </div>
                    {typeof f.focus_summary === "string" && f.focus_summary ? (
                      <CardDescription className="line-clamp-3">{f.focus_summary}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>Vintage: {f.vintage_year != null ? String(f.vintage_year) : "—"}</div>
                    <div>Size (USD): {fmtUsd(f.size_usd)}</div>
                    <div>AUM (USD): {fmtUsd(f.aum_usd)}</div>
                    <div>Lead / follow: {f.lead_follow != null ? String(f.lead_follow).replace(/_/g, " ") : "—"}</div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="people" className="space-y-3">
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No people.</p>
            ) : (
              people.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {String(p.preferred_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Partner")}
                    </CardTitle>
                    <CardDescription>
                      {[p.title, p.role].filter(Boolean).join(" · ") || "—"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {p.email ? <span>{String(p.email)}</span> : null}
                    {p.linkedin_url ? (
                      <a href={String(p.linkedin_url)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        LinkedIn
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="investments" className="space-y-3">
            {investments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No investments.</p>
            ) : (
              investments.map((inv) => (
                <Card key={inv.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{String(inv.company_name)}</CardTitle>
                      <div className="flex flex-wrap gap-1">
                        {inv.sector ? <Badge variant="outline">{String(inv.sector).replace(/_/g, " ")}</Badge> : null}
                        {inv.stage_at_investment ? (
                          <Badge variant="secondary">{String(inv.stage_at_investment).replace(/_/g, " ")}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>Date: {fmtDate(inv.investment_date)}</div>
                    <div>Check: {fmtUsd(inv.check_size_usd)}</div>
                    <div>Round: {inv.round_type != null ? String(inv.round_type) : "—"}</div>
                    <div>Location: {inv.location != null ? String(inv.location) : "—"}</div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="signals" className="space-y-3">
            {signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signals.</p>
            ) : (
              signals.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{String(s.title)}</CardTitle>
                      {s.signal_type ? <Badge variant="outline">{String(s.signal_type).replace(/_/g, " ")}</Badge> : null}
                    </div>
                    <CardDescription>{fmtDate(s.signal_date)}</CardDescription>
                  </CardHeader>
                  {typeof s.description === "string" && s.description ? (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{s.description}</p>
                    </CardContent>
                  ) : null}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="sources" className="space-y-3">
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source links.</p>
            ) : (
              sources.map((src) => (
                <Card key={src.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium">{String(src.label)}</p>
                      <p className="text-xs text-muted-foreground">{String(src.source_type).replace(/_/g, " ")}</p>
                    </div>
                    <a
                      href={String(src.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      Open
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="scores" className="space-y-3">
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No score snapshots.</p>
            ) : (
              snapshots.map((sn) => (
                <Card key={sn.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{fmtDate(sn.computed_at)}</CardTitle>
                    <CardDescription>
                      {sn.model_version != null ? String(sn.model_version) : "—"}
                      {sn.person_id ? " · Person-scoped" : ""}
                      {sn.fund_id ? " · Fund-scoped" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Match: {Number(sn.match_score)}</Badge>
                      <Badge variant="outline">Reputation: {Number(sn.reputation_score)}</Badge>
                      <Badge variant="outline">Deployment: {Number(sn.active_deployment)}</Badge>
                    </div>
                    {typeof sn.explanation === "string" && sn.explanation ? (
                      <p className="text-sm text-muted-foreground">{sn.explanation}</p>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FirmProfile;
