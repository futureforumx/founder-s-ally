import { useMemo, useState, useEffect } from "react";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  FileText,
  Loader2,
  Newspaper,
  Radar,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Types ──

type InvestorUpdateFilter =
  | "all"
  | "posts"
  | "investments"
  | "fund_news"
  | "team"
  | "other";

interface BlogPost {
  id: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  publication: string;
  url: string;
}

type OtherUpdateKind = "investment" | "fund_news" | "team" | "thesis" | "other";

interface OtherUpdate {
  id: string;
  kind: OtherUpdateKind;
  headline: string;
  summary: string;
  at: string;
  url?: string;
}

// ── Seeded mock data (deterministic per firm name) ──

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, i: number): T {
  return arr[(seed + i * 17) % arr.length];
}

function formatDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function relativeOrShort(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return formatDisplayDate(iso);
}

function buildMockPosts(firm: string, seed: number): BlogPost[] {
  const slug = firm.replace(/\s+/g, "-").toLowerCase();
  const templates: Omit<BlogPost, "id" | "publishedAt">[] = [
    {
      title: `Why ${firm} is doubling down on vertical AI workflows`,
      excerpt:
        "Enterprise buyers want agents that ship inside existing compliance boundaries—not generic chat. Here is how we evaluate founders building in regulated stacks.",
      publication: `${firm} Insights`,
      url: `https://example.com/blog/${slug}/vertical-ai`,
    },
    {
      title: "The bar for Series A efficiency just moved again",
      excerpt:
        "Runway discipline, clear ICP expansion, and a path to profitable growth are table stakes. We share the metrics we track across our portfolio.",
      publication: "Medium",
      url: `https://medium.com/search?q=${encodeURIComponent(firm)}`,
    },
    {
      title: `Inside ${firm}'s diligence process for climate infrastructure`,
      excerpt:
        "From grid software to novel materials, we outline what convinces us a team can survive long sales cycles and policy shifts.",
      publication: pick(["Substack", "Firm blog", "LinkedIn"], seed, 0),
      url: `https://example.com/blog/${slug}/climate`,
    },
    {
      title: "What founders get wrong about enterprise pilot design",
      excerpt:
        "Pilots that never convert usually fail on success criteria and executive sponsorship. A practical framework we use with founders post-seed.",
      publication: `${firm} Insights`,
      url: `https://example.com/blog/${slug}/pilots`,
    },
    {
      title: "Notes from the road: healthcare AI that clinicians actually use",
      excerpt:
        "Workflow fit beats model benchmarks. We reflect on patterns from recent investments in clinical copilots and back-office automation.",
      publication: pick(["Substack", "TechCrunch", `${firm} Insights`], seed, 1),
      url: `https://techcrunch.com/search/${encodeURIComponent(firm)}`,
    },
  ];

  const dayOffsets = [1, 4, 9, 16, 22];
  return templates.slice(0, 4).map((t, i) => {
    const daysAgo = pick(dayOffsets, seed, i);
    const published = new Date();
    published.setDate(published.getDate() - daysAgo);
    published.setHours(10 + (seed % 6), (seed * 7 + i * 11) % 60, 0, 0);
    return {
      id: `post-${seed}-${i}`,
      ...t,
      publishedAt: published.toISOString(),
    };
  });
}

function buildMockOtherUpdates(firm: string, seed: number): OtherUpdate[] {
  const items: OtherUpdate[] = [
    {
      id: `inv-${seed}-0`,
      kind: "investment",
      headline: `${firm} co-led $28M Series A in LatticeMind`,
      summary: "Applied LLM stack for industrial quality control; strategic angels from Fortune 500 manufacturers.",
      at: daysAgoIso(seed, 2, 14),
      url: `https://www.crunchbase.com/textsearch?q=${encodeURIComponent(firm)}`,
    },
    {
      id: `fund-${seed}-1`,
      kind: "fund_news",
      headline: "Fund IV first close oversubscribed",
      summary: "Targeting early-stage B2B and fintech; same core partnership, expanded analyst bench.",
      at: daysAgoIso(seed, 3, 9),
    },
    {
      id: `team-${seed}-2`,
      kind: "team",
      headline: "Priya Nair promoted to Partner",
      summary: "Previously principal covering enterprise infrastructure; led two breakout seed deals.",
      at: daysAgoIso(seed, 5, 11),
    },
    {
      id: `thesis-${seed}-3`,
      kind: "thesis",
      headline: "Updated focus: AI ops & compliance tooling",
      summary: "Public mandate shift toward GRC and data lineage; seed checks up to $4M in US and EU.",
      at: daysAgoIso(seed, 7, 16),
    },
    {
      id: `inv-${seed}-4`,
      kind: "investment",
      headline: `Seed round in HarborStack (${firm} lead)`,
      summary: "Developer platform for maritime logistics APIs; repeat founder team from Stripe alum network.",
      at: daysAgoIso(seed, 8, 10),
      url: `https://www.crunchbase.com/textsearch?q=HarborStack`,
    },
    {
      id: `other-${seed}-5`,
      kind: "other",
      headline: "Featured on Invest Like the Best",
      summary: "45-minute conversation on portfolio construction and avoiding hype cycles in AI infra.",
      at: daysAgoIso(seed, 11, 15),
    },
    {
      id: `fund-${seed}-6`,
      kind: "fund_news",
      headline: "Strategic LP additions from global endowments",
      summary: "Three new institutional LPs with deep Asia distribution networks.",
      at: daysAgoIso(seed, 14, 13),
    },
    {
      id: `team-${seed}-7`,
      kind: "team",
      headline: "Operating partner hire: former VP Sales at Datadog",
      summary: "Will run GTM playbooks for portfolio companies scaling past $10M ARR.",
      at: daysAgoIso(seed, 18, 8),
    },
    {
      id: `thesis-${seed}-8`,
      kind: "thesis",
      headline: "Published annual letter to founders",
      summary: "Themes: capital efficiency, AI copilots with measurable ROI, and vertical SaaS resilience.",
      at: daysAgoIso(seed, 21, 12),
    },
    {
      id: `other-${seed}-9`,
      kind: "other",
      headline: "Keynote at SaaStr Annual: pacing in 2026",
      summary: "Discussed how top decile firms are reserving follow-on for winners vs. spraying pro-rata.",
      at: daysAgoIso(seed, 26, 17),
    },
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function daysAgoIso(seed: number, baseDays: number, hourJitter: number): string {
  const d = new Date();
  d.setDate(d.getDate() - baseDays - (seed % 3));
  d.setHours(9 + (hourJitter % 8), (seed + hourJitter) % 55, 0, 0);
  return d.toISOString();
}

const FILTER_CHIPS: { key: InvestorUpdateFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "investments", label: "Investments" },
  { key: "fund_news", label: "Fund News" },
  { key: "team", label: "Team Updates" },
  { key: "other", label: "Other" },
];

const OTHER_KIND_META: Record<
  OtherUpdateKind,
  { label: string; chip: Exclude<InvestorUpdateFilter, "all" | "posts">; icon: typeof Building2; badgeClass: string }
> = {
  investment: {
    label: "Investment",
    chip: "investments",
    icon: Sparkles,
    badgeClass: "bg-accent/15 text-accent border-accent/25",
  },
  fund_news: {
    label: "Fund",
    chip: "fund_news",
    icon: Building2,
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  team: {
    label: "Team",
    chip: "team",
    icon: Users,
    badgeClass: "bg-success/10 text-success border-success/25",
  },
  thesis: {
    label: "Thesis",
    chip: "other",
    icon: Radar,
    badgeClass: "bg-warning/10 text-warning border-warning/25",
  },
  other: {
    label: "Update",
    chip: "other",
    icon: FileText,
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

function matchesFilter(filter: InvestorUpdateFilter, kind: OtherUpdateKind): boolean {
  if (filter === "all") return true;
  if (filter === "posts") return false;
  const meta = OTHER_KIND_META[kind];
  if (filter === "other") return meta.chip === "other";
  return meta.chip === filter;
}

function UpdatesEmptyState({ filter }: { filter: InvestorUpdateFilter }) {
  const copy =
    filter === "posts"
      ? {
          title: "No posts in this view",
          body: "Try All to see the full intelligence feed, or check back as new thought leadership is indexed.",
        }
      : filter === "investments"
        ? {
            title: "No investment activity",
            body: "Switch to All or Posts to explore recent content and signals for this investor.",
          }
        : {
            title: "Nothing here yet",
            body: "Adjust the filter above or view All to see blog posts and secondary signals together.",
          };

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-secondary/20 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border shadow-sm">
        <Newspaper className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">{copy.body}</p>
    </div>
  );
}

// ── Component ──

export function InvestorActivity({ firmName, firmId }: { firmName: string; firmId?: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [filter, setFilter] = useState<InvestorUpdateFilter>("all");

  useEffect(() => {
    const interval = setInterval(() => setLastRefreshed(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const { posts, otherUpdates } = useMemo(() => {
    const seed = hashString(`${firmName || "Unknown"}|${firmId ?? ""}`);
    return {
      posts: buildMockPosts(firmName || "This firm", seed),
      otherUpdates: buildMockOtherUpdates(firmName || "This firm", seed),
    };
  }, [firmName, firmId]);

  const visiblePosts = useMemo(() => {
    if (filter === "all" || filter === "posts") return [...posts].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return [];
  }, [posts, filter]);

  const visibleOther = useMemo(() => {
    if (filter === "posts") return [];
    if (filter === "all") return otherUpdates;
    return otherUpdates.filter((u) => matchesFilter(filter, u.kind));
  }, [otherUpdates, filter]);

  const showLatestPostsBlock = visiblePosts.length > 0 && (filter === "all" || filter === "posts");
  const showSecondaryBlock =
    (filter === "all" && visibleOther.length > 0) ||
    (filter !== "all" && filter !== "posts" && visibleOther.length > 0);

  const secondaryTitle =
    filter === "all"
      ? "Deals, funds & team"
      : filter === "investments"
        ? "Investments"
        : filter === "fund_news"
          ? "Fund news"
          : filter === "team"
            ? "Team updates"
            : "Thesis & notable updates";

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshed(new Date());
      setIsRefreshing(false);
    }, 900);
  };

  const isEmpty = !showLatestPostsBlock && !showSecondaryBlock;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-[10px] text-muted-foreground font-medium truncate">
            Live panel · updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
        >
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-all border",
                active
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-secondary/60 text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isEmpty ? (
        <UpdatesEmptyState filter={filter} />
      ) : (
        <div className="space-y-6">
          {showLatestPostsBlock && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Newspaper className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Latest posts</h3>
              </div>
              <div className="space-y-3">
                {visiblePosts.map((post) => (
                  <Card
                    key={post.id}
                    className="overflow-hidden border-border/80 shadow-sm border-l-[3px] border-l-accent/90 bg-card/95"
                  >
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0 opacity-70" />
                            {formatDisplayDate(post.publishedAt)}
                          </span>
                          <span className="text-border">·</span>
                          <span className="font-medium text-foreground/80">{post.publication}</span>
                        </p>
                        <h4 className="mt-2 text-base font-semibold text-foreground leading-snug tracking-tight">
                          {post.title}
                        </h4>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">{post.excerpt}</p>
                      </div>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-4"
                      >
                        Read more
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {showSecondaryBlock && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                <Radar className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{secondaryTitle}</h3>
              </div>
              <div className="rounded-xl border border-border/80 bg-secondary/25 divide-y divide-border/50 overflow-hidden">
                {visibleOther.map((item) => {
                  const meta = OTHER_KIND_META[item.kind];
                  const Icon = meta.icon;
                  const Row = item.url ? "a" : "div";
                  const rowProps = item.url
                    ? { href: item.url, target: "_blank" as const, rel: "noopener noreferrer" as const }
                    : {};
                  return (
                    <Row
                      key={item.id}
                      {...rowProps}
                      className={cn(
                        "flex gap-3 px-3.5 py-2.5 transition-colors",
                        item.url && "cursor-pointer hover:bg-card/80 no-underline",
                      )}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border/60">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 font-semibold", meta.badgeClass)}>
                            {meta.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{relativeOrShort(item.at)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-foreground leading-snug">{item.headline}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">{item.summary}</p>
                      </div>
                      {item.url && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-1" />}
                    </Row>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
