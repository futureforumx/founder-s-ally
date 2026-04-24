import type { Tool } from "@/features/tools/types";
import { ToolCard } from "@/components/tools/ToolCard";

export function ToolGrid({
  tools,
  emptyTitle = "No tools match these filters",
  emptyCopy = "Try broadening your search or resetting one of the filters.",
}: {
  tools: Tool[];
  emptyTitle?: string;
  emptyCopy?: string;
}) {
  if (!tools.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border bg-card/60 p-10 text-center">
        <h2 className="font-clash text-2xl font-semibold tracking-tight text-foreground">{emptyTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} />
      ))}
    </div>
  );
}
