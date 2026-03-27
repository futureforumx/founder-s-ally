import { useState } from "react";

export type TimeRange = "week" | "month" | "quarter" | "ytd";

interface TimeRangeControlProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "ytd", label: "YTD" },
];

export function TimeRangeControl({ value, onChange }: TimeRangeControlProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5 whitespace-nowrap">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all duration-200 ${
            value === opt.key
              ? "bg-card text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Multiplier for mock data based on time range */
export function timeMultiplier(range: TimeRange): number {
  switch (range) {
    case "week": return 0.15;
    case "month": return 0.4;
    case "quarter": return 0.7;
    case "ytd": return 1;
  }
}
