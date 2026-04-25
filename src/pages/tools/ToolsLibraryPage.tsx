import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, ChevronRight, DollarSign, Flame, Megaphone } from "lucide-react";
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
    accent: "text-violet-400",
    iconBg: "bg-violet-500/10 border-violet-500/20",
    glow: "hover:shadow-[0_8px_28px_rgba(139,92,246,0.18)]",
    border: "hover:border-violet-500/30",
  },
  {
    name: "Market & Finance",
    description: "Analytics, finance, and market intelligence tools to run smarter operations.",
    Icon: BarChart3,
    href: "/tools/startup-tools",
    accent: "text-blue-400",
    iconBg: "bg-blue-500/10 border-blue-500/20",
    glow: "hover:shadow-[0_8px_28px_rgba(59,130,246,0.18)]",
    border: "hover:border-blue-500/30",
  },
  {
    name: "Growth & Marketing",
    description: "SEO, content, sales, and marketing tools built for fast-moving startup teams.",
    Icon: Megaphone,
    href: "/tools/startup-tools",
    accent: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    glow: "hover:shadow-[0_8px_28px_rgba(16,185,129,0.18)]",
    border: "hover:border-emerald-500/30",
  },
  {
    name: "Fundraising",
    description: "Tools to build pitch decks, model financials, and manage investor relations.",
    Icon: DollarSign,
    href: "/tools/startup-tools",
    accent: "text-orange-400",
    iconBg: "bg-orange-500/10 border-orange-500/20",
    glow: "hover:shadow-[0_8px_28px_rgba(249,115,22,0.18)]",
    border: "hover:border-orange-500/30",
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
    <div className="font-manrope min-h-screen bg-[#08080f]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 py-8 sm:px-6 sm:py-12">
        <Breadcrumbs items={breadcrumbs} />

        {/* ── 1. Hero ── */}
        <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(91,92,255,0.22),transparent)] p-8 sm:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_80%_50%,rgba(46,230,166,0.06),transparent)]" aria-hidden />
          <div className="relative z-10 flex flex-col gap-8">
            {/* Eyebrow */}
            <span className="inline-flex w-fit items-center rounded-full border border-[#5B5CFF]/30 bg-[#5B5CFF]/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#8788FF]">
              Public directory
            </span>

            {/* Headline */}
            <div className="max-w-2xl space-y-4">
              <h1 className="font-manrope text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Startup Tool Library
              </h1>
              <p className="max-w-lg text-base leading-7 text-white/55 sm:text-lg">
                A curated toolkit covering AI, marketing, finance, and fundraising — everything a modern startup needs, free to explore.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://vekta.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B5CFF] to-[#8788FF] px-6 py-2.5 text-sm font-bold text-white shadow-[0_2px_20px_rgba(91,92,255,0.40)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_4px_28px_rgba(91,92,255,0.55)]"
              >
                Start building with Vekta
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-6 py-2.5 text-sm font-semibold text-white/80 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/10 hover:text-white"
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
                <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4">
                  <div className="font-manrope text-2xl font-extrabold text-white">{stat.value}</div>
                  <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. Featured Tools ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">Featured tools</h2>
            </div>
            <p className="text-sm text-white/45">High-signal tools founders and operators actively use.</p>
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
            <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">Browse by category</h2>
            <p className="text-sm text-white/45">Find the right tools for every stage of your startup journey.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {DISPLAY_CATEGORIES.map(({ name, description, Icon, href, accent, iconBg, glow, border }) => (
              <Link
                key={name}
                to={href}
                className={`group rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.07] ${border} ${glow}`}
              >
                <div className={`mb-4 inline-flex rounded-xl border p-2.5 ${iconBg} ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className={`font-manrope text-base font-bold tracking-tight text-white`}>{name}</div>
                <div className="mt-1.5 text-sm leading-relaxed text-white/45">{description}</div>
                <div className={`mt-4 flex items-center gap-1 text-sm font-bold ${accent}`}>
                  Explore
                  <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 4. Tools Grid ── */}
        <section id="tools-grid" className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">All tools</h2>
            <p className="text-sm text-white/45">
              {filteredTools.length} tools — search and filter to find what you need.
            </p>
          </div>
          <ToolFilters value={filters} onChange={setFilters} options={filterOptions} />
          <ToolGrid tools={filteredTools} />
        </section>

        {/* ── 5. Why tools matter ── */}
        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <div className="border-b border-white/[0.08] p-8 sm:p-10">
            <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">
              Why the right tools matter
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-white/50">
              The best startups don't just move fast — they move smart. The right tools can compress months of work into days and let a small team punch well above its weight.
            </p>
          </div>
          <div className="grid divide-y divide-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {WHY_TOOLS.map((item) => (
              <div key={item.title} className="p-7">
                <div className="font-manrope text-base font-bold text-white">{item.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-white/45">{item.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. Internal Navigation ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">Explore the directory</h2>
            <p className="text-sm text-white/45">Browse by the top-level categories in the Vekta tool library.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTERNAL_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="group flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5B5CFF]/30 hover:bg-white/[0.07] hover:shadow-[0_4px_16px_rgba(91,92,255,0.12)]"
              >
                <div>
                  <div className="font-manrope text-sm font-bold text-white">{link.label}</div>
                  <div className="mt-0.5 text-xs text-white/40">{link.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/25 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#5B5CFF]/70" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── 7. Guides ── */}
        <section className="space-y-7">
          <div className="space-y-1.5">
            <h2 className="font-manrope text-2xl font-extrabold tracking-tight text-white">Guides & resources</h2>
            <p className="text-sm text-white/45">Learn how to get the most from modern startup tools.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GUIDE_LINKS.map((guide) => (
              <Link
                key={guide.title}
                to={guide.href}
                className="group flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5B5CFF]/30 hover:bg-white/[0.07]"
              >
                <span className="text-sm font-semibold text-white/70 transition-colors group-hover:text-white">
                  {guide.title}
                </span>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-white/25 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-[#5B5CFF]/70" />
              </Link>
            ))}
          </div>
        </section>

        {/* ── 8. Final CTA ── */}
        <section className="relative overflow-hidden rounded-[2rem] border border-[#5B5CFF]/20 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(91,92,255,0.25),transparent),linear-gradient(180deg,#0d0d1a,#08080f)] p-10 text-center sm:p-16">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(91,92,255,0.04)_0%,transparent_60%)]" aria-hidden />
          <div className="relative z-10 mx-auto max-w-xl space-y-6">
            <h2 className="font-manrope text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Take this further with Vekta
            </h2>
            <p className="text-base leading-7 text-white/50">
              The tools are just the starting point. Vekta helps you put them together — AI agents, models, and workflows built for your startup.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href="https://vekta.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B5CFF] to-[#8788FF] px-7 py-3 text-sm font-bold text-white shadow-[0_2px_24px_rgba(91,92,255,0.45)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_4px_32px_rgba(91,92,255,0.60)]"
              >
                Start building with Vekta
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-7 py-3 text-sm font-semibold text-white/70 backdrop-blur-sm transition-all duration-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#5B5CFF]/25 hover:bg-white/[0.07] hover:shadow-[0_8px_32px_rgba(91,92,255,0.15)]"
    >
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center rounded-full border border-[#5B5CFF]/30 bg-[#5B5CFF]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#8788FF]">
          {tool.category}
        </span>
        {tool.featured ? (
          <span className="inline-flex items-center rounded-full bg-[#5B5CFF] px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Featured
          </span>
        ) : null}
      </div>
      <div className="mt-4 font-manrope text-[1.1rem] font-bold tracking-tight text-white transition-colors group-hover:text-[#8788FF]">
        {tool.name}
      </div>
      <p className="mt-2 flex-1 line-clamp-2 text-sm leading-relaxed text-white/50">
        {tool.shortDescription}
      </p>
      <div className="mt-5 flex items-center gap-1.5 font-manrope text-sm font-bold text-[#5B5CFF]">
        Use tool
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
