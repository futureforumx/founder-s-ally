import type { Tool } from "@/features/tools/types";

function Block({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  return (
    <div className={`rounded-[1.5rem] border p-5 ${tone === "good" ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}`}>
      <h3 className="font-clash text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-foreground/90">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ProsCons({ tool }: { tool: Tool }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Block title="Pros" items={tool.pros} tone="good" />
      <Block title="Cons" items={tool.cons} tone="bad" />
    </section>
  );
}
