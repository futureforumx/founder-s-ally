import { ArrowUpRight, Flame, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/tools/StarRating";
import type { Tool } from "@/features/tools/types";

function booleanBadge(value: boolean | null, truthyLabel: string) {
  return value ? <Badge variant="success-sm">{truthyLabel}</Badge> : null;
}

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Card className="group flex h-full flex-col rounded-[1.5rem] border-zinc-800 bg-zinc-900 shadow-sm transition-all hover:-translate-y-1 hover:border-zinc-700 hover:shadow-lg">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline-sm">{tool.category}</Badge>
          <Badge variant="muted-sm">{tool.subcategory}</Badge>
          {tool.featured ? <Badge variant="default-sm">Featured</Badge> : null}
          {tool.trending ? <Badge variant="warning-sm"><Flame className="mr-1 h-3 w-3" />Trending</Badge> : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link
                to={`/tools/${tool.slug}`}
                className="font-manrope text-xl font-semibold tracking-tight text-zinc-100 transition-colors hover:text-primary"
              >
                {tool.name}
              </Link>
              <p className="mt-1 text-sm text-zinc-400">{tool.type}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <p className="text-sm leading-6 text-zinc-400">{tool.shortDescription}</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary-sm">{tool.pricing}</Badge>
          {booleanBadge(tool.freeTier, "Free tier")}
          {booleanBadge(tool.openSource, "Open source")}
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Best for</div>
          <p className="mt-1 text-sm text-zinc-100">{tool.bestFor.slice(0, 2).join(" • ")}</p>
        </div>

        <StarRating rating={tool.userRating} />
      </CardContent>

      <CardFooter className="mt-auto flex items-center justify-between gap-3">
        <Button asChild className="rounded-full">
          <Link to={`/tools/${tool.slug}`}>View details</Link>
        </Button>
        {tool.websiteUrl ? (
          <Button variant="outline" asChild className="rounded-full border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
            <a href={tool.websiteUrl} target="_blank" rel="noreferrer">
              Website
            </a>
          </Button>
        ) : (
          <div className="text-xs text-zinc-500">Website unavailable</div>
        )}
      </CardFooter>
    </Card>
  );
}
