import type { Tool } from "@/features/tools/types";

function renderBoolean(value: boolean | null, truthy: string, falsy: string) {
  if (value === true) return truthy;
  if (value === false) return falsy;
  return "Unknown";
}

const items = (tool: Tool) => [
  ["Category", tool.category],
  ["Subcategory", tool.subcategory],
  ["Type", tool.type],
  ["Website", tool.websiteUrl ? tool.websiteUrl : "Website unavailable"],
  ["Pricing", tool.pricing || "Pricing not listed"],
  ["Free tier", renderBoolean(tool.freeTier, "Available", "Not listed")],
  ["Open source", renderBoolean(tool.openSource, "Yes", "No")],
  ["Skill level", tool.skillLevel],
  ["Autonomy", tool.autonomy ?? "N/A"],
  ["Mobile app", renderBoolean(tool.mobileApp, "Yes", "No")],
];

export function ToolMetadataTable({ tool }: { tool: Tool }) {
  return (
    <section className="rounded-[1.75rem] border border-border/70 bg-white/90 p-6 shadow-sm">
      <h2 className="font-clash text-2xl font-semibold tracking-tight text-foreground">Tool details</h2>
      <div className="mt-5 divide-y divide-border/70 rounded-[1.25rem] border border-border/70">
        {items(tool).map(([label, value]) => (
          <div key={label} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_1fr]">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
            <div className="break-all text-sm text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
