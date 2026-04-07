import { useMemo } from "react";
import {
  resolveAverageDealSize,
  SPARKLINE_FALLBACK_MULTIPLIERS,
  formatDealSizeDisplay,
  type FirmDealAmountRow,
  type FirmPartnerCheckRow,
} from "@/lib/averageDealSizeUsd";

/** Reference teal from design spec */
const DEAL_TEAL = "#086e7d";

interface AverageDealSizeCardProps {
  minCheckUsd?: number | null;
  maxCheckUsd?: number | null;
  deals?: FirmDealAmountRow[] | null;
  partners?: FirmPartnerCheckRow[] | null;
  typicalCheckHint?: string | null;
  directorySweetSpot?: string | null;
}

function polylinePoints(multipliers: number[]): string {
  const w = 200;
  const padL = 6;
  const padR = 6;
  const padT = 8;
  const axisY = 36;
  const innerW = w - padL - padR;
  const innerH = axisY - padT - 2;
  return multipliers
    .map((m, i) => {
      const x = padL + (i / (multipliers.length - 1)) * innerW;
      const y = padT + innerH * (1 - m);
      return `${x},${y}`;
    })
    .join(" ");
}

export function AverageDealSizeCard({
  minCheckUsd,
  maxCheckUsd,
  deals,
  partners,
  typicalCheckHint,
  directorySweetSpot,
}: AverageDealSizeCardProps) {
  const resolved = useMemo(
    () =>
      resolveAverageDealSize({
        deals: deals ?? null,
        firmMinUsd: minCheckUsd ?? null,
        firmMaxUsd: maxCheckUsd ?? null,
        partners: partners ?? null,
        typicalCheckHint: typicalCheckHint ?? null,
        directorySweetSpot: directorySweetSpot ?? null,
      }),
    [deals, minCheckUsd, maxCheckUsd, partners, typicalCheckHint, directorySweetSpot],
  );

  const multipliers =
    resolved.sparklineMultipliers ??
    (resolved.valueUsd != null ? SPARKLINE_FALLBACK_MULTIPLIERS : null);

  const points = useMemo(
    () => (multipliers ? polylinePoints(multipliers) : ""),
    [multipliers],
  );

  const display =
    resolved.valueUsd != null ? formatDealSizeDisplay(resolved.valueUsd) : "—";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Average deal size
      </h4>
      <p
        className="mt-2 text-[1.65rem] font-bold leading-none tracking-tight tabular-nums"
        style={{ color: resolved.valueUsd != null ? DEAL_TEAL : undefined }}
      >
        <span className={resolved.valueUsd == null ? "text-muted-foreground" : ""}>{display}</span>
      </p>
      <p className="mt-1.5 text-sm font-normal text-muted-foreground">{resolved.subtitle}</p>

      <div className="mt-4">
        <svg viewBox="0 0 200 48" className="h-12 w-full text-foreground" aria-hidden>
          <line
            x1="4"
            y1="36"
            x2="196"
            y2="36"
            className="stroke-border/60"
            strokeWidth="1"
          />
          {resolved.valueUsd != null && points ? (
            <polyline
              fill="none"
              stroke={DEAL_TEAL}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
          ) : (
            <text x="100" y="22" textAnchor="middle" className="fill-muted-foreground/50 text-[9px]">
              No trend data
            </text>
          )}
          <text x="4" y="46" className="fill-current text-[9px] font-medium">
            {resolved.sparklineStartYear}
          </text>
          <text x="196" y="46" textAnchor="end" className="fill-current text-[9px] font-medium">
            {resolved.sparklineEndYear}
          </text>
        </svg>
      </div>
    </div>
  );
}
