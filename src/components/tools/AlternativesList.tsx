import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { buildCompanyLogoCandidates } from "@/lib/company-logo";
import type { Tool } from "@/features/tools/types";

function getInitials(name: string): string {
  return name
    .split(/[\s\-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function AltLogo({ name, websiteUrl }: { name: string; websiteUrl: string | null }) {
  const candidates = buildCompanyLogoCandidates({ websiteUrl, size: 32 });
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;

  if (!src) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[10px] font-bold text-primary">
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
      <img
        src={src}
        alt={name}
        className="h-5 w-5 object-contain"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}

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
                className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                <div className="flex items-center gap-3">
                  <AltLogo name={match.name} websiteUrl={match.websiteUrl} />
                  <span>{match.name}</span>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
              </Link>
            ) : (
              <div key={name} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-500">
                  {getInitials(name)}
                </div>
                {name}
              </div>
            );
          })
        ) : (
          <div className="text-sm text-zinc-400">No alternatives are listed yet.</div>
        )}
      </div>
    </section>
  );
}
