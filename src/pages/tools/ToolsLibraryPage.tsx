import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, ChevronRight, DollarSign, Flame, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    gradient: "from-violet-500/8 to-blue-500/8",
    accent: "text-violet-600",
    iconBg: "bg-violet-50 border-violet-200/70",
    hoverBorder: "hover:border-violet-300/60",
    hoverShadow: "hover:shadow-[0_8px_28px_rgba(139,92,246,0.12)]",
  },
  {
    name: "Market & Finance",
    description: "Analytics, finance, and market intelligence tools to run smarter operations.",
    Icon: BarChart3,
    href: "/tools/startup-tools",
    gradient: "from-blue-500/8 to-cyan-500/8",
    accent: "text-blue-600",
    iconBg: "bg-blue-50 border-blue-200/70",
    hoverBorder: "hover:border-blue-300/60",
    hoverShadow: "hover:shadow-[0_8px_28px_rgba(59,130,246,0.12)]",
  },
  {
    name: "Growth & Marketing",
    description: "SEO, content, sales, and marketing tools built for fast-moving startup teams.",
    Icon: Megaphone,
    href: "/tools/startup-tools",
    gradient: "from-emerald-500/8 to-green-500/8",
    accent: "text-emerald-600",
    iconBg: "bg-emerald-50 border-emerald-200/70",
    hoverBorder: "hover:border-emerald-300/60",
    hoverShadow: "hover:shadow-[0_8px_28px_rgba(16,185,129,0.12)]",
  },
  {
    name: "Fundraising",
    description: "Tools to build pitch decks, model financials, and manage investor relations.",
    Icon: DollarSign,
    href: "/tools/startup-tools",
    gradient: "from-orange-500/8 to-amber-500/8",
    accent: "text-orange-600",
    iconBg: "bg-orange-50 border-orange-200/70",
    hoverBorder: "hover:border-orange-300/60",
    hoverShadow: "hover:shadow-[0_8px_28px_rgba(249,115,22,0.12)]",
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f9ff_0%,#f4f6ff_30%,#fafafa_60%,#ffffff_100%)]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 py-8 sm:px-6 sm:py-12">
        <Breadcrumbs items={breadcrumbs} />

        {/* ── 1. Hero ── */}
        <section className="relative overflow-hidden rounded-[2rem] border border-border/50 bg-[radial-gradient(ellipse_80%_60%_at_50%_-5%,rgba(99,102,241,0.11),transparent),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,255,0.97))] p-6 shadow-sm sm:p-10">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_60%,rgba(99,102,241,0.03)_100%)]" aria-hidden />
          <div className="relative z-10 flex flex-col gap-7">
            {/* Eyebrow */}
            <span className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-clash text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Public directory
            </span>

            {/* Headline + subtext */}
            <div className="max-w-2xl space-y-3">
              <h1 className="font-clash text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
                Startup Tool Library
              </h1>
              <p className="max-w-lg text-base leading-7 text-muted-foreground">
                A curated toolkit covering AI, marketing, finance, and fundraising — everything a modern startup needs, free to explore.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary: Vekta conversion */}
              <a
                href="https://vekta.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_2px_16px_rgba(99,102,241,0.30)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_4px_24px_rgba(99,102,241,0.40)]"
              >
                Start building with Vekta
                <ArrowRight className="h-4 w-4" />
              </a>
              {/* Secondary: scroll */}
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center rounded-full border border-border/70 bg-white/80 px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:border-border hover:bg-white hover:shadow"
              >
                Browse tools
              </button>
            </div>

            {/* Stats */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: `${allTools.length}+`, label: "Tools listed" },
                { value: "4", label: "Top categories" },
                { value: "Free", label: "To use and explore" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/50 bg-white/80 px-4 py-3.5 shadow-sm">
                  <div className="font-clash text-2xl font-bold tracking-tight text-foreground">{stat.value}</div>
                  <div className="mt-0.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. Featured Tools ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">Featured tools</h2>
            </div>
            <p className="text-sm text-muted-foreground">High-signal tools founders and operators actively use.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featuredTools.map((tool) => (
              <FeaturedToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>

        {/* ── 3. Categories ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">Browse by category</h2>
            <p className="text-sm text-muted-foreground">Find the right tools for every stage of your startup journey.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DISPLAY_CATEGORIES.map(({ name, description, Icon, href, gradient, accent, iconBg, hoverBorder, hoverShadow }) => (
              <Link
                key={name}
                to={href}
                className={`group rounded-2xl border border-border/50 bg-gradient-to-br ${gradient} p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 ${hoverBorder} ${hoverShadow}`}
              >
                <div className={`mb-4 inline-flex rounded-xl border p-2.5 ${iconBg} ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-clash text-[1.05rem] font-bold tracking-tight text-foreground">{name}</div>
                <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</div>
                <div className={`mt-4 flex items-center gap-1 text-sm font-semibold ${accent}`}>
                  Explore
                  <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 4. Tools Grid ── */}
        <section id="tools-grid" className="space-y-7">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">All tools</h2>
              <p className="text-sm text-muted-foreground">
                {filteredTools.length} tools — search and filter to find what you need.
              </p>
            </div>
          </div>
          <ToolFilters value={filters} onChange={setFilters} options={filterOptions} />
          <ToolGrid tools={filteredTools} />
        </section>

        {/* ── 5. Why tools matter ── */}
        <section className="overflow-hidden rounded-[2rem] border border-border/50 bg-white shadow-sm">
          <div className="border-b border-border/50 p-8 sm:p-10">
            <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">
              Why the right tools matter
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
              The best startups don't just move fast — they move smart. The right combination of AI and startup tools can compress months of work into days and let a small team punch well above its weight.
            </p>
          </div>
          <div className="grid divide-y divide-border/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {WHY_TOOLS.map((item) => (
              <div key={item.title} className="p-7">
                <div className="font-clash text-base font-bold tracking-tight text-foreground">{item.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. Internal Navigation ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">Explore the directory</h2>
            <p className="text-sm text-muted-foreground">Browse by the top-level categories in the Vekta tool library.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTERNAL_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="group flex items-center justify-between rounded-2xl border border-border/50 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_4px_16px_rgba(99,102,241,0.08)]"
              >
                <div>
                  <div className="font-clash text-sm font-bold tracking-tight text-foreground">{link.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{link.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary/60" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── 7. Guides ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-clash text-2xl font-bold tracking-tight text-foreground">Guides & resources</h2>
            <p className="text-sm text-muted-foreground">Learn how to get the most from modern startup tools.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GUIDE_LINKS.map((guide) => (
              <Link
                key={guide.title}
                to={guide.href}
                className="group flex items-center justify-between rounded-2xl border border-border/50 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
              >
                <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                  {guide.title}
                </span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-primary/60" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── 8. Final CTA ── */}
        <section className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(99,102,241,0.18),transparent),linear-gradient(135deg,#0f172a,#1e1b4b)] p-10 text-center shadow-2xl sm:p-16">
          {/* Subtle noise / shimmer layer */}
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03)_0%,transparent_50%,rgba(255,255,255,0.02)_100%)]" aria-hidden />
          <div className="relative z-10 mx-auto max-w-xl space-y-6">
            <h2 className="font-clash text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Take this further with Vekta
            </h2>
            <p className="text-base leading-7 text-white/55">
              The tools are just the starting point. Vekta helps you put them together — AI agents, models, and workflows built for your startup.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href="https://vekta.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-bold text-slate-900 shadow-[0_2px_20px_rgba(255,255,255,0.18)] transition-all duration-200 hover:scale-[1.03] hover:bg-white/95 hover:shadow-[0_4px_28px_rgba(255,255,255,0.25)]"
              >
                Start building with Vekta
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-semibold text-white/80 backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/15 hover:text-white"
              >
                Back to tools
              </button>
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-white to-slate-50/50 p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_8px_32px_rgba(99,102,241,0.10),0_2px_8px_rgba(0,0,0,0.05)]"
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline-sm">{tool.category}</Badge>
        {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
      </div>
      <div className="mt-4 font-clash text-[1.1rem] font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
        {tool.name}
      </div>
      <p className="mt-2 flex-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground/80">
        {tool.shortDescription}
      </p>
      <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-primary">
        Use tool
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
