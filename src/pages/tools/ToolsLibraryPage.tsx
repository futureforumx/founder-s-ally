import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, Flame, LibraryBig } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryHero } from "@/components/tools/CategoryHero";
import { ToolFilters } from "@/components/tools/ToolFilters";
import { ToolGrid } from "@/components/tools/ToolGrid";
import { Breadcrumbs } from "@/components/tools/Breadcrumbs";
import { FAQSection } from "@/components/tools/FAQSection";
import { buildBreadcrumbSchema, usePageSeo } from "@/features/tools/lib/seo";
import {
  DEFAULT_TOOL_FILTERS,
  TOOL_CATEGORY_INTROS,
  TOOL_CATEGORY_SLUGS,
  buildCategoryFaq,
  filterTools,
  getAllTools,
  getFeaturedTools,
  getFilterOptions,
  getPopularCategoryStats,
  getRecentlyAddedTools,
  getTrendingTools,
} from "@/features/tools/lib/tools";

export default function ToolsLibraryPage() {
  const [filters, setFilters] = useState(DEFAULT_TOOL_FILTERS);
  const allTools = useMemo(() => getAllTools(), []);
  const filteredTools = useMemo(() => filterTools(filters, allTools), [allTools, filters]);
  const featuredTools = useMemo(() => getFeaturedTools().slice(0, 6), []);
  const trendingTools = useMemo(() => getTrendingTools().slice(0, 6), []);
  const recentlyAdded = useMemo(() => getRecentlyAddedTools(6), []);
  const filterOptions = useMemo(() => getFilterOptions(allTools), [allTools]);
  const popularSubcategories = useMemo(() => getPopularCategoryStats(), []);
  const breadcrumbs = [{ label: "Tools" }];

  usePageSeo({
    title: "AI & Startup Tool Library | Vekta",
    description:
      "Explore Vekta's curated AI and startup tool library covering AI agents, AI models, AI skills, developer tools, marketing software, analytics, finance, and more.",
    canonicalPath: "/tools",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "AI & Startup Tool Library",
        description:
          "Curated directory of AI agents, AI models, AI skills, and startup software with category pages and standalone tool pages.",
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
    <div className="min-h-screen bg-[#050506] font-sans text-zinc-100 antialiased">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <Breadcrumbs items={breadcrumbs} />

        <CategoryHero
          eyebrow="Public directory"
          title="AI & Startup Tool Library"
          description="A curated directory of AI agents, AI models, AI skills, and startup software built to help founders and operators research the tools shaping modern company building."
          stats={[
            { label: "Tools listed", value: String(allTools.length) },
            { label: "Top-level categories", value: "4" },
            { label: "Subcategories", value: String(filterOptions.subcategories.length) },
          ]}
        >
          <div className="flex flex-wrap gap-3">
            {Object.entries(TOOL_CATEGORY_SLUGS).map(([label, slug]) => (
              <Button key={slug} variant="outline" className="rounded-full border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" asChild>
                <Link to={`/tools/${slug}`}>{label}</Link>
              </Button>
            ))}
          </div>
        </CategoryHero>

        <ToolFilters value={filters} onChange={setFilters} options={filterOptions} />

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-clash text-2xl font-semibold tracking-tight text-zinc-100">All tools</h2>
              <p className="mt-1 text-sm text-zinc-400">{filteredTools.length} tools match the current search and filter state.</p>
            </div>
          </div>
          <ToolGrid tools={filteredTools} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <h2 className="font-clash text-2xl font-semibold tracking-tight text-zinc-100">Featured and trending tools</h2>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                High-signal pages to start with if you want a faster view of what founders and operators are actively searching.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[...featuredTools.slice(0, 3), ...trendingTools.slice(0, 3)].map((tool) => (
                  <Link
                    key={tool.slug}
                    to={`/tools/${tool.slug}`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-primary/40 hover:bg-primary/10"
                  >
                    <div className="flex flex-wrap gap-2">
                      {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
                      {tool.trending ? <Badge variant="warning-sm">Trending</Badge> : null}
                    </div>
                    <div className="mt-3 font-medium text-zinc-100">{tool.name}</div>
                    <div className="mt-1 text-sm text-zinc-400">{tool.shortDescription}</div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <h2 className="font-clash text-2xl font-semibold tracking-tight text-zinc-100">Recently added</h2>
              </div>
              <div className="mt-5 space-y-3">
                {recentlyAdded.map((tool) => (
                  <Link
                    key={tool.slug}
                    to={`/tools/${tool.slug}`}
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/10"
                  >
                    <div>
                      <div className="font-medium text-zinc-100">{tool.name}</div>
                      <div className="text-sm text-zinc-400">{tool.subcategory}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-zinc-500" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <LibraryBig className="h-4 w-4 text-primary" />
            <h2 className="font-clash text-2xl font-semibold tracking-tight text-zinc-100">Popular categories</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(TOOL_CATEGORY_INTROS).map(([category, intro]) => {
              const slug = TOOL_CATEGORY_SLUGS[category as keyof typeof TOOL_CATEGORY_SLUGS];
              return (
                <Link
                  key={slug}
                  to={`/tools/${slug}`}
                  className="rounded-[1.5rem] border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40"
                >
                  <div className="font-clash text-xl font-semibold tracking-tight text-zinc-100">{category}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">{intro.description}</div>
                  <div className="mt-4 text-sm font-medium text-primary">Open category</div>
                </Link>
              );
            })}
          </div>

          <div className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
            <div className="text-sm font-medium text-zinc-100">Top subcategories</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {popularSubcategories.map((item) => (
                <div key={item.subcategory} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-300">
                  {item.subcategory} <span className="text-zinc-500">({item.count})</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FAQSection title="Tool library FAQ" items={buildCategoryFaq("Startup Tools")} />
      </main>
    </div>
  );
}
