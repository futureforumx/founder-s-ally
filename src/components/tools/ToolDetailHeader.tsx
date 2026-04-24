import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/tools/Breadcrumbs";
import { StarRating } from "@/components/tools/StarRating";
import type { BreadcrumbItem, Tool } from "@/features/tools/types";

export function ToolDetailHeader({
  tool,
  breadcrumbs,
}: {
  tool: Tool;
  breadcrumbs: BreadcrumbItem[];
}) {
  return (
    <section className="space-y-5 rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(91,92,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(46,230,166,0.10),transparent_28%),#060709] p-6 shadow-sm sm:p-8">
      <Breadcrumbs items={breadcrumbs} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{tool.category}</Badge>
            <Badge variant="muted">{tool.subcategory}</Badge>
            <Badge variant="secondary">{tool.pricing}</Badge>
            {tool.featured ? <Badge variant="default">Featured</Badge> : null}
            {tool.trending ? <Badge variant="warning">Trending</Badge> : null}
            {tool.freeTier ? <Badge variant="success">Free tier</Badge> : null}
            {tool.openSource ? <Badge variant="accent">Open source</Badge> : null}
          </div>

          <div>
            <h1 className="font-clash text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">{tool.name}</h1>
            <p className="mt-3 text-base leading-7 text-zinc-400">{tool.shortDescription}</p>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-zinc-300">{tool.description}</p>
        </div>

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
