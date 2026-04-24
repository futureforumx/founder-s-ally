import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Tool } from "@/features/tools/types";

export function AlternativesList({
  alternatives,
  alternativeNames,
}: {
  alternatives: Tool[];
  alternativeNames: string[];
}) {
  return (
    <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <h2 className="font-manrope text-2xl font-semibold tracking-tight text-zinc-100">Alternatives</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {alternativeNames.length ? (
          alternativeNames.map((name) => {
            const match = alternatives.find((tool) => tool.name.toLowerCase() === name.toLowerCase());
            return match ? (
              <Link
                key={name}
                to={`/tools/${match.slug}`}
                className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 text-sm font-medium text-zinc-100 transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                <span>{match.name}</span>
                <ArrowRight className="h-4 w-4 text-zinc-500" />
              </Link>
            ) : (
              <div key={name} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 text-sm text-zinc-200">{name}</div>
            );
          })
        ) : (
          <div className="text-sm text-zinc-400">No alternatives are listed yet.</div>
        )}
      </div>
    </section>
  );
}
