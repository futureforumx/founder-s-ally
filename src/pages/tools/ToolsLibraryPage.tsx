import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, ChevronRight, DollarSign, Flame, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/tools/Breadcrumbs";
import { FAQSection } from "@/components/tools/FAQSection";
import { ToolFilters } from "@/components/tools/ToolFilters";
import { ToolGrid } from "@/components/tools/ToolGrid";
import { buildBreadcrumbSchema, usePageSeo } from "@/features/tools/lib/seo";
import {
  DEFAULT_TOOL_FILTERS,
  buildCategoryFaq,
  filterTools,
  getAllTools,
  getFeaturedTools,
  getFilterOptions,
} from "@/features/tools/lib/tools";
import type { Tool } from "@/features/tools/types";

const DISPLAY_CATEGORIES = [
  {
    name: "AI Tools",
    description: "AI agents, models, and skills powering the next generation of startup workflows.",
    Icon: Bot,
    href: "/tools/ai-agents",
    gradient: "from-violet-500/10 to-blue-500/10",
    accent: "text-violet-600",
    iconBorder: "border-violet-200/60",
    cardBorder: "border-violet-200/40",
  },
  {
    name: "Market & Finance",
    description: "Analytics, finance, and market intelligence tools to run smarter operations.",
    Icon: BarChart3,
    href: "/tools/startup-tools",
    gradient: "from-blue-500/10 to-cyan-500/10",
    accent: "text-blue-600",
    iconBorder: "border-blue-200/60",
    cardBorder: "border-blue-200/40",
  },
  {
    name: "Growth & Marketing",
    description: "SEO, content, sales, and marketing tools built for fast-moving startup teams.",
    Icon: Megaphone,
    href: "/tools/startup-tools",
    gradient: "from-green-500/10 to-emerald-500/10",
    accent: "text-green-600",
    iconBorder: "border-green-200/60",
    cardBorder: "border-green-200/40",
  },
  {
    name: "Fundraising",
    description: "Tools to build pitch decks, model financials, and manage investor relations.",
    Icon: DollarSign,
    href: "/tools/startup-tools",
    gradient: "from-orange-500/10 to-yellow-500/10",
    accent: "text-orange-600",
    iconBorder: "border-orange-200/60",
    cardBorder: "border-orange-200/40",
  },
];

const INTERNAL_LINKS = [
  { label: "AI Agents", href: "/tools/ai-agents", description: "Autonomous AI for startup workflows" },
  { label: "AI Models", href: "/tools/ai-models", description: "LLMs, reasoning models, and more" },
  { label: "AI Skills", href: "/tools/ai-skills", description: "Practical AI capabilities for teams" },
  { label: "Startup Tools", href: "/tools/startup-tools", description: "Software across every function" },
];

const GUIDE_LINKS = [
  { title: "How to pick the right AI model for your startup", href: "/tools/ai-models" },
  { title: "Best AI agents for founders in 2025", href: "/tools/ai-agents" },
  { title: "Top startup tools for early-stage teams", href: "/tools/startup-tools" },
  { title: "AI skills every startup team should know", href: "/tools/ai-skills" },
];

const WHY_TOOLS = [
  {
    title: "Speed",
    description: "The right tools let a two-person team move faster than a twenty-person team using outdated processes.",
  },
  {
    title: "Leverage",
    description: "AI agents and automation multiply every hour you put in — letting you focus on the work only you can do.",
  },
  {
    title: "Clarity",
    description: "Analytics and research tools give you the signal to make confident decisions without waiting for more data.",
  },
];

function scrollToGrid() {
  document.getElementById("tools-grid")?.scrollIntoView({ behavior: "smooth" });
}

export default function ToolsLibraryPage() {
  const [filters, setFilters] = useState(DEFAULT_TOOL_FILTERS);
  const allTools = useMemo(() => getAllTools(), []);
  const filteredTools = useMemo(() => filterTools(filters, allTools), [allTools, filters]);
  const featuredTools = useMemo(() => getFeaturedTools().slice(0, 6), []);
  const filterOptions = useMemo(() => getFilterOptions(allTools), [allTools]);
  const breadcrumbs = [{ label: "Tools" }];

  usePageSeo({
    title: "Startup Tool Library | Vekta",
    description:
      "Discover free tools for founders covering AI agents, models, marketing, finance, and fundraising. The startup toolkit built for modern company building.",
    canonicalPath: "/tools",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Startup Tool Library",
        description: "Curated directory of free tools for founders covering AI, marketing, finance, and fundraising.",
        url: "https://vekta.app/tools",
      },
      buildBreadcrumbSchema(breadcrumbs),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: buildCategoryFaq("Startup Tools").map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfcff_0%,#f6f8ff_40%,#ffffff_100%)]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-8 sm:px-6 sm:py-12">
        <Breadcrumbs items={breadcrumbs} />

        {/* 1. Hero */}
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(46,230,166,0.16),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,247,255,0.96))] p-6 shadow-sm sm:p-8">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.45)_35%,transparent_70%)]" aria-hidden />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="max-w-3xl space-y-4">
              <p className="font-clash text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Public directory
              </p>
              <h1 className="font-clash text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                Startup Tool Library
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                A curated toolkit covering AI agents, models, marketing, finance, and fundraising — everything a modern startup needs, researched and free to explore.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="rounded-full" onClick={scrollToGrid}>
                Browse tools
              </Button>
              <Button size="lg" variant="outline" className="rounded-full bg-white/70" asChild>
                <a href="https://vekta.app" target="_blank" rel="noreferrer">
                  Start building with Vekta
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: `${allTools.length}+`, label: "Tools listed" },
                { value: "4", label: "Top categories" },
                { value: "Free", label: "To use and explore" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/60 bg-white/75 px-4 py-4 shadow-sm">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">{stat.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. Featured Tools */}
        <section className="space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">Featured tools</h2>
            </div>
            <p className="text-sm text-muted-foreground">High-signal tools founders and operators actively use.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredTools.map((tool) => (
              <FeaturedToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>

        {/* 3. Categories */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">Browse by category</h2>
            <p className="text-sm text-muted-foreground">Find the right tools for every stage of your startup journey.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DISPLAY_CATEGORIES.map(({ name, description, Icon, href, gradient, accent, iconBorder, cardBorder }) => (
              <Link
                key={name}
                to={href}
                className={`group rounded-[1.5rem] border bg-gradient-to-br ${gradient} ${cardBorder} p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md`}
              >
                <div className={`mb-4 inline-flex rounded-xl border ${iconBorder} bg-white/80 p-2.5 ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-clash text-xl font-semibold tracking-tight text-foreground">{name}</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
                <div className={`mt-4 flex items-center gap-1 text-sm font-medium ${accent}`}>
                  Explore <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 4. Tools Grid */}
        <section id="tools-grid" className="space-y-6">
          <div className="space-y-1">
            <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">All tools</h2>
            <p className="text-sm text-muted-foreground">
              {filteredTools.length} tools — search and filter to find what you need.
            </p>
          </div>
          <ToolFilters value={filters} onChange={setFilters} options={filterOptions} />
          <ToolGrid tools={filteredTools} />
        </section>

        {/* 5. Educational Section */}
        <section className="rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-sm sm:p-10">
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">
                Why the right tools matter
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                The best startups don't just move fast — they move smart. The right combination of AI and startup tools can compress months of work into days, give you leverage competitors don't have, and let a small team punch well above its weight.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {WHY_TOOLS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/60 bg-muted/30 p-5">
                  <div className="font-clash text-lg font-semibold tracking-tight text-foreground">{item.title}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Internal Navigation */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">Explore the directory</h2>
            <p className="text-sm text-muted-foreground">Browse by the top-level categories in the Vekta tool library.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTERNAL_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="group flex items-center justify-between rounded-[1.5rem] border border-border/70 bg-white/90 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="font-clash text-base font-semibold tracking-tight text-foreground">{link.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{link.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        {/* 7. Guides */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="font-clash text-3xl font-semibold tracking-tight text-foreground">Guides & resources</h2>
            <p className="text-sm text-muted-foreground">Learn how to get the most from modern startup tools.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GUIDE_LINKS.map((guide) => (
              <Link
                key={guide.title}
                to={guide.href}
                className="group flex items-center justify-between rounded-[1.5rem] border border-border/70 bg-white/90 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
              >
                <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                  {guide.title}
                </span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.12),transparent_50%),linear-gradient(135deg,rgba(244,247,255,0.98),rgba(255,255,255,0.98))] p-10 text-center shadow-sm sm:p-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.4)_40%,transparent_70%)]" aria-hidden />
          <div className="relative z-10 mx-auto max-w-2xl space-y-6">
            <h2 className="font-clash text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Take this further with Vekta
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              The tools are just the starting point. Vekta helps you put them together — AI agents, models, and workflows built for your startup, not a template.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" className="rounded-full" asChild>
                <a href="https://vekta.app" target="_blank" rel="noreferrer">
                  Start building with Vekta
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full bg-white/70" onClick={scrollToGrid}>
                Back to tools
              </Button>
            </div>
          </div>
        </section>

        <FAQSection title="Tool library FAQ" items={buildCategoryFaq("Startup Tools")} />
      </main>
    </div>
  );
}

function FeaturedToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex flex-col rounded-[1.5rem] border border-border/70 bg-white/90 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline-sm">{tool.category}</Badge>
        {tool.freeTier ? <Badge variant="success-sm">Free</Badge> : null}
        {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
      </div>
      <div className="mt-4 font-clash text-xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
        {tool.name}
      </div>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{tool.shortDescription}</p>
      <div className="mt-5 flex items-center gap-1 text-sm font-medium text-primary">
        Use tool <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
