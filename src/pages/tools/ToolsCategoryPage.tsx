import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const relatedCategoryMap: Record<ToolCategory, ToolCategory[]> = {
  "AI Agents": ["AI Models", "AI Skills", "Startup Tools"],
  "AI Models": ["AI Agents", "AI Skills", "Startup Tools"],
  "AI Skills": ["AI Agents", "AI Models", "Startup Tools"],
  "Startup Tools": ["AI Agents", "AI Models", "AI Skills"],
};

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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <Breadcrumbs items={breadcrumbs} />

        <CategoryHero
          eyebrow="Category page"
          title={intro.title}
          description={intro.description}
          stats={[
            { label: "Tools in category", value: String(source.length) },
            { label: "Subcategories", value: String(subcategories.length) },
            { label: "Related categories", value: String(relatedCategoryMap[category].length) },
          ]}
        >
          <div className="flex flex-wrap gap-2">
            {subcategories.map((subcategory) => {
              const active = filters.subcategory === subcategory;
              return (
                <Button
                  key={subcategory}
                  variant={active ? "default" : "outline"}
                  className={active ? "rounded-full" : "rounded-full border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"}
                  onClick={() => setFilters((current) => ({ ...current, subcategory: active ? "All" : subcategory }))}
                >
                  {subcategory}
                </Button>
              );
            })}
          </div>
        </CategoryHero>

        <ToolFilters value={filters} onChange={setFilters} options={options} hideCategory />

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">{category} tools</h2>
              <p className="mt-1 text-sm text-zinc-400">{filtered.length} tools match the active filters in this category.</p>
            </div>
          </div>
          <ToolGrid tools={filtered} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Related categories</h2>
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
                    <ArrowRight className="h-4 w-4 text-zinc-500" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="p-6">
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Browse subcategories</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {subcategories.map((subcategory) => (
                  <Badge
                    key={subcategory}
                    variant="outline"
                    className="cursor-pointer border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-primary/40 hover:bg-primary/10 hover:text-zinc-100"
                    onClick={() => setFilters((current) => ({ ...current, subcategory }))}
                  >
                    {subcategory}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <FAQSection items={faqItems} />
      </main>
    </div>
  );
}
