import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { Tool } from "@/features/tools/types";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-white to-slate-50/60 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_8px_32px_rgba(99,102,241,0.09),0_2px_8px_rgba(0,0,0,0.05)]">
      {/* Main content */}
      <div className="flex flex-1 flex-col p-5">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline-sm">{tool.category}</Badge>
          <Badge variant="muted-sm">{tool.subcategory}</Badge>
          {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
          {tool.trending ? (
            <Badge variant="warning-sm">
              <Flame className="mr-1 h-2.5 w-2.5" />Trending
            </Badge>
          ) : null}
        </div>

        {/* Title */}
        <div className="mt-3.5 flex items-start justify-between gap-2">
          <Link
            to={`/tools/${tool.slug}`}
            className="font-clash text-[1.05rem] font-semibold leading-snug tracking-tight text-foreground transition-colors hover:text-primary"
          >
            {tool.name}
          </Link>
          <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary/50" />
        </div>

        {/* Description — 2 lines max */}
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground/80">
          {tool.shortDescription}
        </p>

        {/* Pricing badges */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge variant="secondary-sm">{tool.pricing}</Badge>
          {tool.openSource ? <Badge variant="success-sm">Open source</Badge> : null}
        </div>

        {/* Best for — subtle metadata */}
        {tool.bestFor.length > 0 ? (
          <p className="mt-auto pt-4 text-xs text-muted-foreground/55">
            {tool.bestFor.slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 px-5 py-3">
        <Link
          to={`/tools/${tool.slug}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary transition-all duration-150 hover:gap-2.5"
        >
          Use tool
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
        </Link>
        {tool.websiteUrl ? (
          <a
            href={tool.websiteUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            Website ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
