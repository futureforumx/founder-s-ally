import type { Tool } from "@/features/tools/types";

function Block({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  return (
    <div className={`rounded-[1.5rem] border p-5 ${tone === "good" ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
      <h3 className="font-clash text-xl font-semibold tracking-tight text-zinc-100">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-zinc-300">{item}</li>
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
