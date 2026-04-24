import type { Tool } from "@/features/tools/types";
import { ToolGrid } from "@/components/tools/ToolGrid";

export function RelatedTools({
  title,
  description,
  tools,
}: {
  title: string;
  description: string;
  tools: Tool[];
}) {
  if (!tools.length) return null;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-clash text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ToolGrid tools={tools} />
    </section>
  );
}
