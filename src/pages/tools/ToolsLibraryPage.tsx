import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, ExternalLink, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageSeo } from "@/features/tools/lib/seo";
import { cn } from "@/lib/utils";

type DirectoryTool = {
  name: string;
  slug: string;
  description: string;
  category: string;
  featured?: boolean;
};

const VEKTA_CTA_HREF = "https://tryvekta.com";

const CATEGORIES = [
  "Market & Finance",
  "Growth",
  "AI Tools",
  "Fundraising",
  "Operations",
] as const;

const TOOLS: DirectoryTool[] = [
  {
    name: "Burn Rate Calculator",
    slug: "burn-rate-calculator",
    description: "Track monthly cash burn and project how long your runway will last.",
    category: "Market & Finance",
    featured: true,
  },
  {
    name: "Runway Calculator",
    slug: "runway-calculator",
    description: "See exactly how many months of runway you have left at your current pace.",
    category: "Market & Finance",
    featured: true,
  },
  {
    name: "TAM / SAM / SOM Calculator",
    slug: "tam-calculator",
    description: "Size your market with a structured top-down or bottom-up estimate.",
    category: "Market & Finance",
    featured: true,
  },
  {
    name: "LTV / CAC Calculator",
    slug: "ltv-cac-calculator",
    description: "Measure customer lifetime value against acquisition cost in seconds.",
    category: "Growth",
    featured: true,
  },
  {
    name: "Equity Dilution Modeler",
    slug: "equity-dilution",
    description: "Project ownership across rounds and option pool top-ups.",
    category: "Fundraising",
    featured: true,
  },
  {
    name: "Pricing Page Generator",
    slug: "pricing-page-generator",
    description: "Generate a clean, conversion-tested pricing layout from a few inputs.",
    category: "Growth",
    featured: true,
  },
  {
    name: "ARR Calculator",
    slug: "arr-calculator",
    description: "Convert MRR, contract values, and discounts into a clean ARR view.",
    category: "Market & Finance",
  },
  {
    name: "Investor Email Generator",
    slug: "investor-email-generator",
    description: "Draft a tight, founder-toned cold email to investors in seconds.",
    category: "Fundraising",
  },
  {
    name: "Pitch Deck Outliner",
    slug: "pitch-deck-outliner",
    description: "Get a 10–12 slide outline tailored to your stage and category.",
    category: "Fundraising",
  },
  {
    name: "Subject Line Tester",
    slug: "subject-line-tester",
    description: "Score cold-outbound subject lines for clarity, urgency, and reply potential.",
    category: "Growth",
  },
  {
    name: "AI Agent Cost Estimator",
    slug: "ai-agent-cost-estimator",
    description: "Estimate monthly token spend for production agent workloads.",
    category: "AI Tools",
  },
  {
    name: "Hiring Plan Builder",
    slug: "hiring-plan-builder",
    description: "Plan headcount additions against runway and revenue milestones.",
    category: "Operations",
  },
];

const GUIDES = [
  { title: "How to calculate your TAM, SAM, and SOM", href: "/guides/tam" },
  { title: "A founder's guide to SaaS pricing", href: "/guides/pricing" },
  { title: "When to raise — and how much", href: "/guides/fundraising-timing" },
  { title: "Burn, runway, and the unit economics that matter", href: "/guides/unit-economics" },
];

function SectionWrapper({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={cn("space-y-5", className)}>
      {children}
    </section>
  );
}

function ToolCard({ tool }: { tool: DirectoryTool }) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex shrink-0 rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
          {tool.category}
        </span>
        <Badge variant="success-sm">Free</Badge>
      </div>
      <h3 className="mt-4 font-manrope text-lg font-semibold tracking-tight text-zinc-100">{tool.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-400">{tool.description}</p>
      <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Use tool
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function ToolGrid({ tools }: { tools: DirectoryTool[] }) {
  if (!tools.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-10 text-center">
        <p className="text-sm text-zinc-400">No tools match your filters.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} />
      ))}
    </div>
  );
}

function CategoryList({
  categories,
  active,
  onSelect,
}: {
  categories: readonly string[];
  active: string | null;
  onSelect: (category: string | null) => void;
}) {
  const baseClass = "rounded-full border px-4 py-2 text-sm font-medium transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          baseClass,
          active === null
            ? "border-primary/60 bg-primary/15 text-zinc-100"
            : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        )}
      >
        All
      </button>
      {categories.map((category) => {
        const isActive = active === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(isActive ? null : category)}
            className={cn(
              baseClass,
              isActive
                ? "border-primary/60 bg-primary/15 text-zinc-100"
                : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
            )}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

export default function ToolsLibraryPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const featuredTools = useMemo(() => TOOLS.filter((tool) => tool.featured).slice(0, 6), []);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      const matchesCategory = !activeCategory || tool.category === activeCategory;
      const matchesSearch =
        !query || tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  usePageSeo({
    title: "Free Startup Tools & Calculators | Vekta",
    description:
      "Free calculators and tools for founders — burn rate, runway, TAM, LTV/CAC, equity dilution, pricing, fundraising, and growth. Built by Vekta.",
    canonicalPath: "/tools",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Free Startup Tools & Calculators",
        description: "Free, no-signup tools and calculators built for founders.",
        url: "https://vekta.app/tools",
      },
    ],
  });

  return (
    <div className="min-h-screen bg-[#050506] font-manrope text-zinc-100 antialiased">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-10 sm:px-6 sm:py-14">
        <SectionWrapper className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.20),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(46,230,166,0.12),transparent_28%),#060709] p-8 shadow-sm sm:p-12">
          <p className="font-manrope text-xs font-semibold uppercase tracking-[0.22em] text-primary">Free for founders</p>
          <h1 className="mt-3 font-manrope text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
            Free Startup Tools & Calculators
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
            Sharpen your numbers in seconds. Use these free, no-signup calculators to size markets, model burn and
            runway, project unit economics, and pressure-test fundraising plans — built by founders, for founders.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative w-full sm:max-w-md">
              <span className="sr-only">Search tools</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tools and calculators"
                className="h-11 border-zinc-700 bg-zinc-900/80 pl-9 text-zinc-100 placeholder:text-zinc-500"
              />
            </label>
            <Button asChild size="lg" className="h-11 rounded-full px-6">
              <a href={VEKTA_CTA_HREF} target="_blank" rel="noreferrer">
                Start building with Vekta
              </a>
            </Button>
          </div>
        </SectionWrapper>

        <SectionWrapper>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/fresh-capital"
              className="group flex items-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-manrope text-base font-semibold text-zinc-100">Fresh Funds</h3>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Track newly raised VC funds and spot investor mandates before the market does.
                </p>
              </div>
            </Link>

            <Link
              to="/tools/ai-agents"
              className="group flex items-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-manrope text-base font-semibold text-zinc-100">AI Agent Library</h3>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Browse and compare AI agent platforms, frameworks, and tools built for founders.
                </p>
              </div>
            </Link>
          </div>
        </SectionWrapper>

        <SectionWrapper>
          <div>
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Featured tools</h2>
            <p className="mt-1 text-sm text-zinc-400">The most-used calculators on Vekta — start here.</p>
          </div>
          <ToolGrid tools={featuredTools} />
        </SectionWrapper>

        <SectionWrapper>
          <div>
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Browse by category</h2>
            <p className="mt-1 text-sm text-zinc-400">Filter the full directory by what you're working on.</p>
          </div>
          <CategoryList categories={CATEGORIES} active={activeCategory} onSelect={setActiveCategory} />
        </SectionWrapper>

        <SectionWrapper>
          <div>
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">All tools</h2>
            <p className="mt-1 text-sm text-zinc-400">{filteredTools.length} tools — all free, all no-signup.</p>
          </div>
          <ToolGrid tools={filteredTools} />
        </SectionWrapper>

        <SectionWrapper>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-sm sm:p-10">
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">
              Why founders use calculators
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300 sm:text-base">
              <p>
                Most founder decisions come down to numbers — runway, growth, ownership, pricing — but those numbers
                rarely get computed cleanly under pressure. Free calculators turn napkin math into something you can
                stand behind in an investor meeting or a board update.
              </p>
              <p>
                The goal isn't to predict the future precisely; it's to remove arithmetic mistakes, force consistent
                assumptions, and make tradeoffs visible. A 10-second runway check before a hire, or a TAM sanity check
                before pitching, is what separates a confident founder from a guessing one.
              </p>
            </div>
          </div>
        </SectionWrapper>

        <SectionWrapper>
          <div>
            <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Founder guides</h2>
            <p className="mt-1 text-sm text-zinc-400">Deeper reads to pair with the tools above.</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {GUIDES.map((guide) => (
              <li key={guide.href}>
                <Link
                  to={guide.href}
                  className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-zinc-100"
                >
                  <span>{guide.title}</span>
                  <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionWrapper>

        <SectionWrapper className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl space-y-3">
              <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                Take this further with Vekta
              </h2>
              <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
                Calculators are a great start. Vekta combines investor intelligence, fundraising tooling, and AI agents
                in one place — so the numbers you just modeled actually move.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full bg-zinc-100 text-zinc-950 hover:bg-white">
              <a href={VEKTA_CTA_HREF} target="_blank" rel="noreferrer">
                Get started
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </SectionWrapper>
      </main>
    </div>
  );
}
