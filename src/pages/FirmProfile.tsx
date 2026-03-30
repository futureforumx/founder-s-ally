import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Building2, ExternalLink, Globe, Linkedin, Mail, MapPin, RefreshCw, Twitter, BookOpen, FileText, Sparkles } from "lucide-react";

import { supabaseVcDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import { fetchVCFirmDetail, type VCFirmDetail, type VcFundRow } from "@/lib/vcFirmDetail";
import { fetchVcRatingsForFirm } from "@/lib/vcRatingsQueries";
import { aggregateVcRatings, INTERACTION_DISPLAY, type VcRatingRow } from "@/lib/vcRatingsAggregate";
import { useEnrichFirmTeam } from "@/hooks/useEnrichFirmTeam";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Article type (matches vc_people.articles JSONB schema)
// ---------------------------------------------------------------------------
type PersonArticle = {
  title: string;
  url: string;
  published_at?: string;
  platform?: "medium" | "substack" | "linkedin" | "twitter" | "company_blog" | "other";
  summary?: string;
};

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

function fmtVcRatingWhen(row: VcRatingRow): string {
  const raw = row.interaction_date || row.created_at?.slice(0, 10);
  if (!raw) return "—";
  try {
    return format(parseISO(raw.length <= 10 ? `${raw}T12:00:00` : raw), "MMM d, yyyy");
  } catch {
    return raw;
  }
}

const FirmProfile = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["vc-firm-detail", id],
    queryFn: () => fetchVCFirmDetail(supabaseVcDirectory, id!),
    enabled: Boolean(id && isSupabaseConfigured),
  });

  const ratingsQuery = useQuery({
    queryKey: ["vc-ratings-firm", id],
    queryFn: () => fetchVcRatingsForFirm(id!),
    enabled: Boolean(id && isSupabaseConfigured),
  });

  const { enrich, isLoading: isEnriching, result: enrichResult, error: enrichError } = useEnrichFirmTeam(id);

  async function handleEnrich() {
    await enrich();
    // Refresh firm detail to show updated people
    await queryClient.invalidateQueries({ queryKey: ["vc-firm-detail", id] });
  }

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
    const msg = (query.error as Error).message;
    const isJwtKeyError =
      msg.includes("No suitable key") ||
      msg.includes("wrong key type") ||
      msg.includes("PGRST301");

    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle>Could not load firm</CardTitle>
            <CardDescription className="space-y-2 text-pretty">
              {isJwtKeyError ? (
                <>
                  <p>
                    Supabase rejected the token (often: Clerk’s <strong>default</strong> session JWT was sent). This app only sends the Clerk template named{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase</code>, which must match{" "}
                    <a
                      className="font-medium text-accent underline-offset-4 hover:underline"
                      href="https://supabase.com/docs/guides/auth/third-party/clerk"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Supabase’s Clerk guide
                    </a>
                    .
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clerk → Configure → JWT Templates → create <code className="rounded bg-muted px-1">supabase</code>. Supabase → Authentication → add Clerk as third-party provider. Then sign out and sign in again.
                  </p>
                </>
              ) : (
                <p>
                  {msg}. If this is a policy error, add RLS <code className="text-xs">SELECT</code> on <code className="text-xs">vc_*</code> for the{" "}
                  <code className="text-xs">authenticated</code> role.
                </p>
              )}
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
  const ratingRows = ratingsQuery.data ?? [];
  const ratingAgg = aggregateVcRatings(ratingRows);
  const recentRating = ratingRows[0];

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
        {ratingsQuery.isError ? (
          <Card className="mb-8 border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Founder ratings</CardTitle>
              <CardDescription className="text-destructive">
                Could not load ratings. Check RLS and that <code className="text-xs">vc_ratings</code> exists.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : !ratingsQuery.isLoading ? (
          <Card className="mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {String(firm.firm_name)} ({ratingAgg.count} rating{ratingAgg.count === 1 ? "" : "s"})
              </CardTitle>
              <CardDescription>Founder-submitted interaction scores (by type).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {ratingAgg.count === 0 ? (
                <p className="text-muted-foreground">No founder ratings yet.</p>
              ) : (
                <>
                  <p>
                    <span className="font-semibold">Overall:</span>{" "}
                    {ratingAgg.overallStars != null ? `${ratingAgg.overallStars.toFixed(1)}/5` : "—"}
                    <span className="text-muted-foreground">
                      {" "}
                      · NPS: {ratingAgg.nps}
                    </span>
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">By interaction</p>
                    <ul className="list-none space-y-0.5 pl-0">
                      {ratingAgg.breakdown.map((b) => (
                        <li key={b.interactionType} className="flex flex-wrap gap-x-2 gap-y-0">
                          <span>
                            {INTERACTION_DISPLAY[b.interactionType] ?? b.interactionType} ({b.count}):
                          </span>
                          <span className="font-medium text-foreground tabular-nums">
                            {b.avgStars != null ? `${b.avgStars.toFixed(1)}/5` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {recentRating ? (
                    <p className="text-xs text-muted-foreground border-t pt-3">
                      <span className="font-semibold text-foreground">Recent:</span>{" "}
                      {fmtVcRatingWhen(recentRating)}{" "}
                      {INTERACTION_DISPLAY[recentRating.interaction_type] ?? recentRating.interaction_type} –{" "}
                      <span className="italic">
                        &ldquo;
                        {(recentRating.comment || recentRating.interaction_detail || "No comment").slice(0, 120)}
                        {(recentRating.comment || recentRating.interaction_detail || "").length > 120 ? "…" : ""}
                        &rdquo;
                      </span>
                      {recentRating.anonymous ? (
                        <span className="text-foreground"> [Anon]</span>
                      ) : null}
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="mb-8 text-sm text-muted-foreground">Loading founder ratings…</p>
        )}

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
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 border-0 bg-transparent p-0 shadow-none backdrop-blur-0">
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

          <TabsContent value="people" className="space-y-4">
            {/* Enrichment toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {people.length === 0
                  ? "No team members yet — click Sync Team to pull from the firm's website."
                  : `${people.length} team member${people.length === 1 ? "" : "s"}`}
              </p>
              <div className="flex items-center gap-2">
                {enrichResult ? (
                  <span className="text-xs text-muted-foreground">
                    +{enrichResult.added} added · ~{enrichResult.updated} updated · {enrichResult.signalsAdded} articles
                  </span>
                ) : enrichError ? (
                  <span className="text-xs text-destructive">{enrichError}</span>
                ) : null}
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEnrich}
                        disabled={isEnriching}
                        className="gap-1.5"
                      >
                        {isEnriching ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {isEnriching ? "Syncing…" : "Sync Team"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-xs">
                      Scrapes the firm's website team page to pull investor bios, social profiles, and thought-leadership articles.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {people.length === 0 ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                {people.map((p) => {
                  const fullName = String(
                    p.preferred_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Partner"
                  );
                  const initials = fullName
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase();

                  const articles: PersonArticle[] = Array.isArray((p as Record<string, unknown>).articles)
                    ? (p as Record<string, unknown>).articles as PersonArticle[]
                    : [];

                  const investmentThemes: string[] = Array.isArray((p as Record<string, unknown>).investment_themes)
                    ? (p as Record<string, unknown>).investment_themes as string[]
                    : (p as Record<string, unknown>).personal_thesis_tags as string[] ?? [];

                  const mediumUrl = (p as Record<string, unknown>).medium_url as string | null | undefined;
                  const substackUrl = (p as Record<string, unknown>).substack_url as string | null | undefined;

                  return (
                    <Card key={p.id} className="flex flex-col">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-11 w-11 shrink-0 border">
                            {p.avatar_url ? (
                              <AvatarImage src={String(p.avatar_url)} alt={fullName} />
                            ) : null}
                            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-sm font-semibold">{fullName}</CardTitle>
                            <CardDescription className="truncate text-xs">
                              {[p.title, p.role].filter(Boolean).join(" · ") || "Partner"}
                            </CardDescription>
                            {/* Social links row */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {p.linkedin_url ? (
                                <a
                                  href={String(p.linkedin_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label="LinkedIn"
                                >
                                  <Linkedin className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {p.x_url ? (
                                <a
                                  href={String(p.x_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label="X / Twitter"
                                >
                                  <Twitter className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {mediumUrl ? (
                                <a
                                  href={String(mediumUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-muted-foreground hover:text-foreground font-medium"
                                  aria-label="Medium"
                                >
                                  M
                                </a>
                              ) : null}
                              {substackUrl ? (
                                <a
                                  href={String(substackUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label="Substack"
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {p.email ? (
                                <a
                                  href={`mailto:${String(p.email)}`}
                                  className="text-muted-foreground hover:text-foreground"
                                  aria-label={`Email ${fullName}`}
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-2 pt-0 text-xs text-muted-foreground">
                        {/* Bio */}
                        {p.bio ? (
                          <p className="line-clamp-3 leading-relaxed">{String(p.bio)}</p>
                        ) : null}

                        {/* Investment themes */}
                        {investmentThemes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {investmentThemes.slice(0, 6).map((theme) => (
                              <Badge key={theme} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                                {theme}
                              </Badge>
                            ))}
                          </div>
                        ) : null}

                        {/* Thought leadership articles */}
                        {articles.length > 0 ? (
                          <div className="mt-1 space-y-1 border-t pt-2">
                            <p className="flex items-center gap-1 font-medium text-foreground">
                              <FileText className="h-3 w-3" />
                              Thought leadership ({articles.length})
                            </p>
                            <ul className="space-y-0.5 pl-0">
                              {articles.slice(0, 3).map((article) => (
                                <li key={article.url} className="truncate">
                                  <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-foreground hover:underline truncate"
                                  >
                                    {article.title}
                                    {article.platform ? (
                                      <span className="ml-1 opacity-60">· {article.platform}</span>
                                    ) : null}
                                  </a>
                                </li>
                              ))}
                              {articles.length > 3 ? (
                                <li className="text-muted-foreground/60">+{articles.length - 3} more</li>
                              ) : null}
                            </ul>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
