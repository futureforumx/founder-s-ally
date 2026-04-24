import { Navigate, Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolDetailHeader } from "@/components/tools/ToolDetailHeader";
import { ToolMetadataTable } from "@/components/tools/ToolMetadataTable";
import { ProsCons } from "@/components/tools/ProsCons";
import { AlternativesList } from "@/components/tools/AlternativesList";
import { RelatedTools } from "@/components/tools/RelatedTools";
import { FAQSection } from "@/components/tools/FAQSection";
import { buildBreadcrumbSchema, getCanonicalUrl, usePageSeo } from "@/features/tools/lib/seo";
import {
  TOOL_CATEGORY_SLUGS,
  buildToolFaq,
  getAlternatives,
  getRelatedTools,
  getToolBySlug,
} from "@/features/tools/lib/tools";

function listSchema(title: string, items: string[]) {
  return {
    "@type": "PropertyValue",
    name: title,
    value: items.join(", "),
  };
}

export default function ToolDetailPage() {
  const { slug = "" } = useParams();
  const tool = getToolBySlug(slug);

  if (!tool) {
    return <Navigate to="/tools" replace />;
  }

  const categoryPath = `/tools/${TOOL_CATEGORY_SLUGS[tool.category]}`;
  const path = `/tools/${tool.slug}`;
  const breadcrumbs = [
    { label: "Tools", href: "/tools" },
    { label: tool.category, href: categoryPath },
    { label: tool.name },
  ];
  const related = getRelatedTools(tool, 6);
  const alternatives = getAlternatives(tool);
  const faqItems = buildToolFaq(tool);
  const description = `${tool.name} is listed in Vekta's ${tool.category.toLowerCase()} directory for ${tool.shortDescription.toLowerCase()}`;

  usePageSeo({
    title: `${tool.name} | ${tool.category} | Vekta`,
    description,
    canonicalPath: path,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": tool.websiteUrl ? "SoftwareApplication" : "WebApplication",
        name: tool.name,
        applicationCategory: tool.category,
        operatingSystem: "Web",
        description,
        url: tool.websiteUrl ?? getCanonicalUrl(path),
        sameAs: tool.websiteUrl ?? undefined,
        offers: {
          "@type": "Offer",
          description: tool.pricing,
        },
        featureList: tool.useCases,
        additionalProperty: [
          listSchema("Best for", tool.bestFor),
          listSchema("Pros", tool.pros),
          listSchema("Cons", tool.cons),
        ],
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
        <ToolDetailHeader tool={tool} breadcrumbs={breadcrumbs} />

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
            <CardContent className="space-y-5 p-6">
              <div>
                <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Use cases</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tool.useCases.map((useCase) => (
                    <Badge key={useCase} variant="outline">{useCase}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Best for</h2>
                <ul className="mt-4 space-y-3">
                  {tool.bestFor.map((item) => (
                    <li key={item} className="text-sm leading-7 text-zinc-300">{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Tags</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tool.tags.map((tag) => (
                    <Badge key={tag} variant="muted">{tag}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <ToolMetadataTable tool={tool} />
        </section>

        <ProsCons tool={tool} />

        <AlternativesList alternatives={alternatives} alternativeNames={tool.alternatives} />

        <RelatedTools
          title="Related tools"
          description="Internal links to closely related tools, categories, and adjacent software in the directory."
          tools={related}
        />

        <FAQSection items={faqItems} />

        <Card className="rounded-[1.75rem] border-zinc-800 bg-zinc-900 shadow-sm">
          <CardContent className="p-6">
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Continue browsing</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/tools" className="rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-primary/40 hover:bg-primary/10">
                All tools
              </Link>
              <Link to={categoryPath} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-primary/40 hover:bg-primary/10">
                {tool.category}
              </Link>
              <Link to={`/tools/${TOOL_CATEGORY_SLUGS["Startup Tools"]}`} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-primary/40 hover:bg-primary/10">
                Startup tools
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
