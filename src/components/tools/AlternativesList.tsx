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
    <section className="rounded-[1.75rem] border border-border/70 bg-white/90 p-6 shadow-sm">
      <h2 className="font-clash text-2xl font-semibold tracking-tight text-foreground">Alternatives</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {alternativeNames.length ? (
          alternativeNames.map((name) => {
            const match = alternatives.find((tool) => tool.name.toLowerCase() === name.toLowerCase());
            return match ? (
              <Link
                key={name}
                to={`/tools/${match.slug}`}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span>{match.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ) : (
              <div key={name} className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-4 text-sm text-foreground">{name}</div>
            );
          })
        ) : (
          <div className="text-sm text-muted-foreground">No alternatives are listed yet.</div>
        )}
      </div>
    </section>
  );
}
