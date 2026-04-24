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
    <section className="space-y-5 rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-sm sm:p-8">
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
            <h1 className="font-clash text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{tool.name}</h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">{tool.shortDescription}</p>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-foreground/90">{tool.description}</p>
        </div>

        <div className="w-full max-w-sm rounded-[1.5rem] border border-border/70 bg-muted/40 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quick view</div>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Type</div>
              <div className="font-medium text-foreground">{tool.type}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Skill level</div>
              <div className="font-medium text-foreground">{tool.skillLevel}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Autonomy</div>
              <div className="font-medium text-foreground">{tool.autonomy ?? "N/A"}</div>
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
              <div className="text-xs text-muted-foreground">Website unavailable</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
