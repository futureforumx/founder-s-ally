import type { FounderWaitlistSnapshot } from "@/lib/waitlist";
import { cn } from "@/lib/utils";

const CARD = "rounded-xl border border-zinc-800/90 bg-[#121212]/80 px-4 py-3 text-left";

type Props = {
  loading: boolean;
  snapshot: FounderWaitlistSnapshot | null;
  /** True when fetch failed — still show friendly empty state */
  fetchFailed: boolean;
  onMatchClick?: (payload: { firmName: string; url?: string }) => void;
};

export function FounderWaitlistSnapshotPanel({ loading, snapshot, fetchFailed, onMatchClick }: Props) {
  if (loading) {
    return (
      <div className={cn(CARD, "animate-pulse space-y-2")}>
        <p className="text-2xs font-medium uppercase tracking-wide text-[#888888]">Generating your initial snapshot…</p>
        <div className="h-3 w-[75%] rounded bg-zinc-800/80" />
        <div className="h-3 w-full rounded bg-zinc-800/60" />
        <div className="h-3 w-5/6 rounded bg-zinc-800/60" />
      </div>
    );
  }

  const data = snapshot;

  return (
    <div className="space-y-4 text-left">
      <section className={CARD}>
        <h3 className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Investor matches</h3>
        {fetchFailed || !data?.investorMatches?.length ? (
          <p className="mt-2 text-sm text-[#b3b3b3]">
            We didn’t load live matches this time—your shortlist will appear inside Vekta once you’re in.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.investorMatches.map((m, i) => (
              <li key={`${m.firmName}-${i}`} className="border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("text-sm font-semibold text-zinc-100 underline-offset-2 hover:underline")}
                      onClick={() => onMatchClick?.({ firmName: m.firmName, url: m.url })}
                    >
                      {m.firmName}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-zinc-100">{m.firmName}</span>
                  )}
                  {m.investorName ? (
                    <span className="text-2xs text-[#888888]">{m.investorName}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-2xs leading-relaxed text-[#b3b3b3]/90">{m.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h3 className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Market signal</h3>
        <p className="mt-2 text-sm leading-snug text-[#c4c4c4]">
          {data?.marketSignal?.text ??
            "Early-stage investors are staying selective while prize category leaders."}
        </p>
      </section>

      <section className={CARD}>
        <h3 className="text-2xs font-medium uppercase tracking-wide text-[#b3b3b3]">Suggested next step</h3>
        <p className="mt-2 text-sm leading-snug text-[#c4c4c4]">
          {data?.nextStep?.text ?? "Refine your target investor list so outreach stays high-signal."}
        </p>
      </section>
    </div>
  );
}
