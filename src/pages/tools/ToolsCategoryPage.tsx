import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/tools/Breadcrumbs";
import { CategoryHero } from "@/components/tools/CategoryHero";
import { FAQSection } from "@/components/tools/FAQSection";
import { ToolFilters } from "@/components/tools/ToolFilters";
import { ToolGrid } from "@/components/tools/ToolGrid";
import { buildBreadcrumbSchema, usePageSeo } from "@/features/tools/lib/seo";
import {
  DEFAULT_TOOL_FILTERS,
  TOOL_CATEGORY_INTROS,
  TOOL_CATEGORY_SLUGS,
  buildCategoryFaq,
  filterTools,
  getCategoryHref,
  getFilterOptions,
  getToolsByCategory,
} from "@/features/tools/lib/tools";
import type { ToolCategory } from "@/features/tools/types";
import { cn } from "@/lib/utils";

const VEKTA_CTA_HREF = "https://tryvekta.com";

const relatedCategoryMap: Record<ToolCategory, ToolCategory[]> = {
  "AI Agents": ["AI Models", "AI Skills", "Startup Tools"],
  "AI Models": ["AI Agents", "AI Skills", "Startup Tools"],
  "AI Skills": ["AI Agents", "AI Models", "Startup Tools"],
  "Startup Tools": ["AI Agents", "AI Models", "AI Skills"],
};

const AI_AGENTS_SEO_LINKS = [
  { label: "Best AI Agents for Startups", href: "/tools/ai-agents" },
  { label: "Open Source AI Agents", href: "/tools/ai-agents" },
  { label: "No-Code AI Agents", href: "/tools/ai-agents" },
  { label: "AI Coding Agents", href: "/tools/ai-agents" },
];

export default function ToolsCategoryPage({ category }: { category: ToolCategory }) {
  const source = useMemo(() => getToolsByCategory(category), [category]);
  const [filters, setFilters] = useState({ ...DEFAULT_TOOL_FILTERS, category: "All" as const });
  const filtered = useMemo(() => filterTools(filters, source), [filters, source]);
  const options = useMemo(() => getFilterOptions(source), [source]);
  const subcategories = options.subcategories;
  const intro = TOOL_CATEGORY_INTROS[category];
  const path = `/tools/${TOOL_CATEGORY_SLUGS[category]}`;
  const breadcrumbs = [
    { label: "Tools", href: "/tools" },
    { label: category },
  ];
  const faqItems = buildCategoryFaq(category);
  const featuredTools = useMemo(() => source.filter((t) => t.featured).slice(0, 3), [source]);
  const isAIAgents = category === "AI Agents";

  usePageSeo({
    title: `${intro.title} | Vekta`,
    description: intro.meta,
    canonicalPath: path,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: intro.title,
        description: intro.description,
        url: `https://vekta.app${path}`,
      },
      buildBreadcrumbSchema(breadcrumbs),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  });

  return (
    <div className="min-h-screen bg-[#050506] font-manrope text-zinc-100 antialiased">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12">
        <Breadcrumbs items={breadcrumbs} />

        {/* Hero */}
        <CategoryHero
          eyebrow={isAIAgents ? "AI Agents directory" : `${category} directory`}
          title={isAIAgents ? "Explore AI Agents for Startups" : intro.title}
          description={intro.description}
          stats={[
            { label: "Tools in category", value: String(source.length) },
            { label: "Subcategories", value: String(subcategories.length) },
            { label: "Related categories", value: String(relatedCategoryMap[category].length) },
          ]}
        >
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 rounded-full px-6">
              <a href="#all-tools">Browse {isAIAgents ? "agents" : "tools"}</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 rounded-full border-zinc-700 px-6 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href={VEKTA_CTA_HREF} target="_blank" rel="noreferrer">
                Start building with Vekta
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </CategoryHero>

        {/* Featured section */}
        {featuredTools.length > 0 && (
          <section className="space-y-5">
            <div>
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">
                Featured {isAIAgents ? "agents" : "tools"}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">Top-rated and most popular in this category.</p>
            </div>
            <ToolGrid tools={featuredTools} />
          </section>
        )}

        {/* Subcategory pills */}
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Browse by type</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, subcategory: "All" }))}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                filters.subcategory === "All"
                  ? "border-primary/60 bg-primary/15 text-zinc-100"
                  : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
              )}
            >
              All
            </button>
            {subcategories.map((sub) => {
              const isActive = filters.subcategory === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, subcategory: isActive ? "All" : sub }))}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary/60 bg-primary/15 text-zinc-100"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
                  )}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        </section>

        {/* Filters + all tools grid */}
        <section id="all-tools" className="space-y-5">
          <ToolFilters value={filters} onChange={setFilters} options={options} hideCategory />
          <div>
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">
              All {category} {isAIAgents ? "agents" : "tools"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {filtered.length} {filtered.length === 1 ? "tool" : "tools"} match the active filters.
            </p>
          </div>
          <ToolGrid tools={filtered} />
        </section>

        {/* SEO content (AI Agents specific) */}
        {isAIAgents && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-sm sm:p-10">
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">
                What are AI agents?
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300 sm:text-base">
                <p>
                  AI agents are software systems that perceive their environment, reason about goals, and take actions
                  autonomously — browsing the web, writing and executing code, drafting emails, or managing multi-step
                  workflows — without requiring step-by-step human instruction.
                </p>
                <p>
                  Unlike a simple chatbot that responds to prompts, an agent can plan across multiple steps, use external
                  tools, and adapt based on intermediate results. This makes them especially powerful for founders who
                  want to automate research, customer outreach, data analysis, or internal operations.
                </p>
              </div>
              <div className="mt-6 border-t border-zinc-800 pt-6">
                <h3 className="font-manrope text-lg font-semibold text-zinc-100">How to choose an AI agent</h3>
                <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
                  Start with use case: coding, research, browser automation, or workflow orchestration. Then filter by
                  skill level (no-code vs. developer-facing), pricing model, and whether you need an open-source option
                  you can self-host. Use the subcategory pills and filters above to narrow the directory fast.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {AI_AGENTS_SEO_LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 text-sm font-medium text-zinc-200 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-zinc-100"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Related categories + subcategories */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <h2 className="font-manrope text-xl font-semibold tracking-tight text-zinc-100">Related categories</h2>
              <div className="mt-4 grid gap-3">
                {relatedCategoryMap[category].map((related) => (
                  <Link
                    key={related}
                    to={getCategoryHref(related)}
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-primary/10"
                  >
                    <div>
                      <div className="font-medium text-zinc-100">{related}</div>
                      <div className="text-sm text-zinc-400">{TOOL_CATEGORY_INTROS[related].meta}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <h2 className="font-manrope text-xl font-semibold tracking-tight text-zinc-100">Browse subcategories</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {subcategories.map((subcategory) => (
                  <button
                    key={subcategory}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, subcategory }))}
                    className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-zinc-100"
                  >
                    {subcategory}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <FAQSection items={faqItems} />

        {/* Final CTA */}
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl space-y-3">
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                Build startup workflows faster with Vekta
              </h2>
              <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
                Vekta combines investor intelligence, fundraising tooling, and AI agents in one place — so you can move
                from insight to action without switching tabs.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0 rounded-full bg-zinc-100 text-zinc-950 hover:bg-white">
              <a href={VEKTA_CTA_HREF} target="_blank" rel="noreferrer">
                Start building with Vekta
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
