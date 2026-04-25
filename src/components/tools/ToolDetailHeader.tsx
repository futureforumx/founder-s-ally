import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/tools/Breadcrumbs";
import { StarRating } from "@/components/tools/StarRating";
import { buildCompanyLogoCandidates } from "@/lib/company-logo";
import { getCategoryHref } from "@/features/tools/lib/tools";
import type { BreadcrumbItem, Tool } from "@/features/tools/types";

function getInitials(name: string): string {
  return name
    .split(/[\s\-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function ToolLogo({ name, websiteUrl }: { name: string; websiteUrl: string | null }) {
  const candidates = buildCompanyLogoCandidates({ websiteUrl, size: 128 });
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;

  if (!src) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-zinc-800">
      <img
        src={src}
        alt={name}
        className="h-10 w-10 object-contain"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}

export function ToolDetailHeader({
  tool,
  breadcrumbs,
}: {
  tool: Tool;
  breadcrumbs: BreadcrumbItem[];
}) {
  const categoryHref = getCategoryHref(tool.category);

  return (
    <section className="relative space-y-5 rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(46,230,166,0.10),transparent_28%),#060709] p-6 shadow-sm sm:p-8">
      {/* Back button — upper right */}
      <Link
        to={categoryHref}
        className="absolute right-6 top-6 flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/60 p-2 text-zinc-400 transition-all duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <Breadcrumbs items={breadcrumbs} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-4">
          {/* Badge row */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{tool.category}</Badge>
            <Badge variant="muted">{tool.subcategory}</Badge>
            <Badge variant="secondary" className="text-zinc-100">{tool.pricing}</Badge>
            {tool.featured ? <Badge variant="default">Featured</Badge> : null}
            {tool.trending ? <Badge variant="warning">Trending</Badge> : null}
            {tool.freeTier ? <Badge variant="success" className="text-white">Free tier</Badge> : null}
            {tool.openSource ? <Badge variant="accent" className="text-white">Open source</Badge> : null}
          </div>

          {/* Logo + name */}
          <div className="flex items-center gap-4">
            <ToolLogo name={tool.name} websiteUrl={tool.websiteUrl} />
            <div>
              <h1 className="font-manrope text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
                {tool.name}
              </h1>
              <p className="mt-2 text-base leading-7 text-zinc-400">{tool.shortDescription}</p>
            </div>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-zinc-300">{tool.description}</p>
        </div>

        {/* Quick view panel */}
        <div className="w-full max-w-sm rounded-[1.5rem] border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Quick view</div>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-zinc-400">Type</div>
              <div className="font-medium text-zinc-100">{tool.type}</div>
            </div>
            <div>
              <div className="text-zinc-400">Skill level</div>
              <div className="font-medium text-zinc-100">{tool.skillLevel}</div>
            </div>
            <div>
              <div className="text-zinc-400">Autonomy</div>
              <div className="font-medium text-zinc-100">{tool.autonomy ?? "N/A"}</div>
            </div>
            <StarRating rating={tool.userRating} />
            {tool.websiteUrl ? (
              <Button className="mt-2 w-full rounded-full" asChild>
                <a href={tool.websiteUrl} target="_blank" rel="noreferrer">
                  Visit website
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <div className="text-xs text-zinc-500">Website unavailable</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
