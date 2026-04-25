import { useState } from "react";
import { ArrowUpRight, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/tools/StarRating";
import { buildCompanyLogoCandidates } from "@/lib/company-logo";
import type { Tool } from "@/features/tools/types";

function getInitials(name: string): string {
  return name
    .split(/[\s\-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Logo waterfall: favicon.ico → gstatic faviconV2 → Google s2/favicons → initials.
 * Mirrors the same candidate chain used by FirmLogo / buildCompanyLogoCandidates.
 */
function ToolLogo({ name, websiteUrl }: { name: string; websiteUrl: string | null }) {
  const candidates = buildCompanyLogoCandidates({ websiteUrl, size: 64 });
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;

  if (!src) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm font-semibold text-primary">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800">
      <img
        src={src}
        alt={name}
        className="h-8 w-8 object-contain"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}

function booleanBadge(value: boolean | null, label: string) {
  return value ? <Badge variant="success-sm">{label}</Badge> : null;
}

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Card className="group flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start gap-3">
          <ToolLogo name={tool.name} websiteUrl={tool.websiteUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`/tools/${tool.slug}`}
                className="font-manrope text-base font-semibold leading-snug tracking-tight text-zinc-100 transition-colors hover:text-primary"
              >
                {tool.name}
              </Link>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{tool.type}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex shrink-0 rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
            {tool.subcategory}
          </span>
          {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
          {tool.trending ? <Badge variant="warning-sm"><Flame className="mr-1 h-3 w-3" />Trending</Badge> : null}
        </div>

        <p className="text-sm leading-6 text-zinc-400">{tool.shortDescription}</p>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary-sm">{tool.pricing}</Badge>
          {booleanBadge(tool.freeTier, "Free tier")}
          {booleanBadge(tool.openSource, "Open source")}
          <Badge variant="muted-sm">{tool.skillLevel}</Badge>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Best for</div>
          <p className="mt-1 text-sm text-zinc-200">{tool.bestFor.slice(0, 2).join(" · ")}</p>
        </div>

        <StarRating rating={tool.userRating} />
      </CardContent>

      <CardFooter className="mt-auto flex items-center justify-between gap-3 pt-4">
        <Button asChild className="rounded-full">
          <Link to={`/tools/${tool.slug}`}>View details</Link>
        </Button>
        {tool.websiteUrl ? (
          <Button variant="outline" asChild className="rounded-full border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
            <a href={tool.websiteUrl} target="_blank" rel="noreferrer">Website</a>
          </Button>
        ) : (
          <div className="text-xs text-zinc-500">Website unavailable</div>
        )}
      </CardFooter>
    </Card>
  );
}
