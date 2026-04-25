import { useState } from "react";
import { ArrowRight, ArrowUpRight, Flame, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800">
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

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Card className="group flex h-full flex-col rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-[#0f0f12] shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl hover:shadow-primary/8">
      <CardHeader className="gap-0 space-y-0 p-5 pb-4">
        {/* Logo + name + arrow */}
        <div className="flex items-start gap-3">
          <ToolLogo name={tool.name} websiteUrl={tool.websiteUrl} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`/tools/${tool.slug}`}
                className="font-manrope text-[1.05rem] font-bold leading-snug tracking-tight text-zinc-50 transition-colors duration-150 hover:text-primary"
              >
                {tool.name}
              </Link>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </div>
        </div>

        {/* Category pill + feature/trending icons */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex shrink-0 rounded-full border border-primary/40 bg-primary/12 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
            {tool.subcategory}
          </span>
          {tool.featured ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 p-1" title="Featured">
              <Star className="h-2.5 w-2.5 fill-primary text-primary" />
            </span>
          ) : null}
          {tool.trending ? (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 p-1" title="Trending">
              <Flame className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            </span>
          ) : null}
        </div>

        {/* Description — clamped to 2 lines */}
        <p className="mt-3 line-clamp-2 text-sm leading-[1.65] text-zinc-400">
          {tool.shortDescription}
        </p>
      </CardHeader>

      {/* Compact metadata */}
      <CardContent className="flex-1 px-5 pb-4 pt-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          <span>{tool.pricing}</span>
          <span className="text-zinc-700">·</span>
          <span>{tool.skillLevel}</span>
          {tool.freeTier ? (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-emerald-400/90">Free tier</span>
            </>
          ) : null}
          {tool.openSource ? (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-emerald-400/90">Open source</span>
            </>
          ) : null}
        </div>
      </CardContent>

      {/* CTA row */}
      <CardFooter className="mt-auto border-t border-zinc-800/70 px-5 py-4">
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            asChild
            variant="ghost"
            className="group/link -ml-2 h-8 rounded-full px-2 text-sm font-medium text-zinc-300 hover:bg-transparent hover:text-primary"
          >
            <Link to={`/tools/${tool.slug}`} className="inline-flex items-center gap-1.5">
              View details
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/link:translate-x-0.5" />
            </Link>
          </Button>

          {tool.websiteUrl ? (
            <Button
              variant="outline"
              asChild
              size="sm"
              className="h-8 rounded-full border-zinc-700 px-3 text-xs text-zinc-300 transition-all duration-150 hover:border-primary/50 hover:bg-primary/10 hover:text-zinc-100 hover:shadow-[0_0_12px_rgba(91,92,255,0.15)]"
            >
              <a href={tool.websiteUrl} target="_blank" rel="noreferrer">
                Website
              </a>
            </Button>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
